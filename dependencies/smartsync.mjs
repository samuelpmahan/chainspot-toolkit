import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { sha } from '../facts.mjs';

/** Stage exactly the closed file manifest for the existing root_sync ZIP transport. */
export async function stageForRootSync(root, checkpoint, destination, options={}) {
  const rel=relative(resolve(root),resolve(destination));
  if (rel==='' || (!rel.startsWith(`..${sep}`) && rel!=='..' && !rel.startsWith('/'))) throw Error('SmartSync destination must be outside source');
  await mkdir(destination,{recursive:false});
  for (const file of checkpoint.files) {
    const input = join(root,file.path), bytes = await readFile(input);
    if (sha(bytes) !== file.sha256 || bytes.length !== file.size) throw Error(`Changed since neat: ${file.path}`);
    const output = join(destination,file.path);
    await mkdir(dirname(output),{recursive:true});
    await cp(input,output,{errorOnExist:true});
  }
  const prefix=options.stage?'attempts/stages':'attempts';
  const inner = join(destination,prefix,'checkpoints',`${checkpoint.id}.json`);
  await mkdir(dirname(inner),{recursive:true});
  await writeFile(inner,JSON.stringify(checkpoint,null,2)+'\n');
  await writeFile(join(destination,prefix,'checkpoint.json'),JSON.stringify({id:checkpoint.id,path:`${prefix}/checkpoints/${checkpoint.id}.json`},null,2)+'\n');
  return {directory:destination,files:checkpoint.files.length,checkpointId:checkpoint.id,
    next:options.stage?'python root_sync.py --push --dir DIRECTORY --folder DRIVE_FOLDER_ID; then python localci_test.py --receipt RECEIPT --folder DRIVE_FOLDER_ID --test-cmd "node toolkit.mjs run --recipe recipes/chainspot-s0-s7.json --specimen golden"':
      'python root_sync.py --push --dir DIRECTORY --folder DRIVE_FOLDER_ID; then python localci_test.py --receipt RECEIPT --folder DRIVE_FOLDER_ID --test-cmd "node toolkit.mjs run --target targets/s7-heading.json"'};
}
