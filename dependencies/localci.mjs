import { chmodSync, copyFileSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync,
  symlinkSync, writeFileSync } from 'node:fs';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { sha } from '../facts.mjs';
import { hashFiles } from './hashpool.mjs';

const exists=path=>{try{lstatSync(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
const temp=path=>`${path}.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
const objectPath=(objects,file)=>{const key=`${file.sha256}-${(file.mode??0o644).toString(8)}`;return join(objects,key.slice(0,2),key);};

/** Write once: a temp file with the declared mode, renamed into place (a concurrent writer of the same key writes the same bytes). */
function putObject(path,bytes,mode) {
  mkdirSync(dirname(path),{recursive:true});
  const t=temp(path);
  writeFileSync(t,bytes,{flag:'wx'});
  chmodSync(t,mode);
  renameSync(t,path);
}

/**
 * Materialize only resolved closure into a fresh per-Attempt fork, verifying every byte.
 * With `objects` (a content store: one immutable file per sha256 and mode), each fork file is a hardlink to its
 * verified object instead of a copy; `verifyFork` after the run proves nothing wrote through a link.
 */
export async function materializeFork(root, resolved, forkRoot, {objects}={}) {
  await mkdir(forkRoot,{recursive:true});
  if(!objects) {
    for (const file of resolved.files) {
      const bytes = await readFile(join(root,file.path));
      if (sha(bytes)!==file.sha256 || bytes.length!==file.size) throw Error(`Input changed before LocalCI: ${file.path}`);
      const output=join(forkRoot,file.path);
      await mkdir(dirname(output),{recursive:true});
      await cp(join(root,file.path),output,{errorOnExist:true});
      if (sha(await readFile(output))!==file.sha256) throw Error(`Fork materialization mismatch: ${file.path}`);
    }
    return {files:resolved.files.length,verified:true};
  }
  let linked=0,reused=0,copied=0;
  const dirs=new Set();
  // every stored object is re-hashed before it is linked (on all cores); a corrupt one is evicted and rebuilt
  const paths=resolved.files.map(file=>objectPath(objects,file));
  const hashes=await hashFiles(paths,resolved.files.map(f=>f.size));
  for(const [i,file] of resolved.files.entries()) {
    const object=paths[i],output=join(forkRoot,file.path),h=hashes[i];
    if(!h.error&&h.size===file.size&&h.sha256===file.sha256)reused++;
    else {
      if(!h.error)rmSync(object,{force:true});
      const bytes=readFileSync(join(root,file.path));
      if(sha(bytes)!==file.sha256||bytes.length!==file.size)throw Error(`Input changed before LocalCI: ${file.path}`);
      putObject(object,bytes,file.mode??0o644);
    }
    const parent=dirname(output);
    if(!dirs.has(parent)){mkdirSync(parent,{recursive:true});dirs.add(parent);}
    try { linkSync(object,output); linked++; }
    catch(error) {
      if(!['EXDEV','EPERM','EMLINK'].includes(error.code))throw error;
      copyFileSync(object,output,1); copied++;   // COPYFILE_EXCL
      if(sha(readFileSync(output))!==file.sha256)throw Error(`Fork materialization mismatch: ${file.path}`);
    }
  }
  return {files:resolved.files.length,verified:true,objects:{linked,copied,reused,stored:resolved.files.length-reused}};
}

/**
 * Integrity after the run: every closure file in the fork is still a regular file with its checkpoint bytes and mode.
 * A hardlinked fork shares inodes with the content store, so this is the proof that nothing wrote through a link.
 */
export async function verifyFork(forkRoot, files, {objects}={}) {
  const paths=files.map(file=>join(forkRoot,file.path));
  const hashes=await hashFiles(paths,files.map(f=>f.size));
  for(const [i,file] of files.entries()) {
    const stat=lstatSync(paths[i],{throwIfNoEntry:false}),h=hashes[i];
    if(!stat?.isFile()||h.error||h.size!==file.size||h.sha256!==file.sha256||(file.mode!=null&&(stat.mode&0o777)!==file.mode)) {
      if(objects)rmSync(objectPath(objects,file),{force:true});   // the shared object may be the inode that changed: evict it
      throw Error(`Fork closure changed during the run (integrity): ${file.path}`);
    }
  }
  return {files:files.length,verified:true};
}

/** Every entry under `dir` (relative paths, sorted): files with sha256/size/mode, symlinks with their target, directories. */
export function treeManifest(dir) {
  const entries=[];
  (function visit(rel) {
    for(const name of readdirSync(join(dir,rel)).sort()) {
      const child=rel?`${rel}/${name}`:name,full=join(dir,child),stat=lstatSync(full);
      if(stat.isSymbolicLink())entries.push({path:child,link:readlinkSync(full)});
      else if(stat.isDirectory()){entries.push({path:child,dir:true});visit(child);}
      else if(stat.isFile()){const bytes=readFileSync(full);entries.push({path:child,sha256:sha(bytes),size:bytes.length,mode:stat.mode&0o777});}
      else throw Error(`Unsupported entry in ${dir}: ${child}`);
    }
  })('');
  return entries;
}
const sameTree=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/**
 * `npm ci` once per exact install key (lockfile, package manifests, node and npm versions): the installed tree is
 * kept as an immutable template with its manifest, and a later fork with the same key gets hardlinks to it. The
 * template is re-verified against its manifest before every reuse, and the fork's tree after the run (`verifyModules`).
 */
export async function installModules({providerDir,cache,key,install}) {
  const target=join(providerDir,'node_modules');
  const template=join(cache,key),manifestPath=join(cache,`${key}.json`);
  const saved=exists(manifestPath)?JSON.parse(readFileSync(manifestPath)):null;
  if(saved&&exists(template)&&sameTree(treeManifest(template),saved.entries)) {
    if(exists(target))throw Error(`Fork already has ${target}`);
    mkdirSync(target);
    for(const entry of saved.entries) {
      const from=join(template,entry.path),to=join(target,entry.path);
      if(entry.dir)mkdirSync(to);
      else if(entry.link!==undefined)symlinkSync(entry.link,to);
      else linkSync(from,to);
    }
    return {...saved.install,reused:{key,entries:saved.entries.length}};
  }
  if(saved||exists(template))rmSync(template,{recursive:true,force:true});   // incomplete or corrupt: rebuild
  const result=await install();
  const entries=treeManifest(target);
  const t=temp(template);
  await cp(target,t,{recursive:true,verbatimSymlinks:true,errorOnExist:true});
  if(!sameTree(treeManifest(t),entries)){rmSync(t,{recursive:true,force:true});throw Error('node_modules template copy mismatch');}
  mkdirSync(cache,{recursive:true});
  try { renameSync(t,template); } catch(error) { rmSync(t,{recursive:true,force:true}); if(!['EEXIST','ENOTEMPTY'].includes(error.code))throw error; }
  const mt=temp(manifestPath);
  writeFileSync(mt,JSON.stringify({key,install:result,entries})+'\n');
  renameSync(mt,manifestPath);
  return {...result,stored:{key,entries:entries.length}};
}
export function verifyModules({providerDir,cache,key}) {
  const saved=JSON.parse(readFileSync(join(cache,`${key}.json`)));
  if(!sameTree(treeManifest(join(providerDir,'node_modules')),saved.entries)) {
    rmSync(join(cache,key),{recursive:true,force:true}); rmSync(join(cache,`${key}.json`),{force:true});
    throw Error('Fork node_modules changed during the run (integrity)');
  }
  return {entries:saved.entries.length,verified:true};
}
