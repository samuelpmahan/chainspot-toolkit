"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.predictProbs = predictProbs;
function softmaxInPlace(values) {
    let max = -Infinity;
    for (const value of values)
        if (value > max)
            max = value;
    let sum = 0;
    for (let index = 0; index < values.length; index++) {
        const exponential = Math.exp(values[index] - max);
        values[index] = exponential;
        sum += exponential;
    }
    const inverse = sum > 0 ? 1 / sum : 0;
    for (let index = 0; index < values.length; index++)
        values[index] *= inverse;
}
/** One 10x768 matrix multiply followed by softmax. */
function predictProbs(model, features) {
    const classCount = model.classes.length;
    const featureCount = model.W[0]?.length ?? 768;
    const logits = new Float64Array(classCount);
    for (let classIndex = 0; classIndex < classCount; classIndex++) {
        let score = model.b[classIndex];
        const weights = model.W[classIndex];
        for (let featureIndex = 0; featureIndex < featureCount; featureIndex++) {
            score += weights[featureIndex] * features[featureIndex];
        }
        logits[classIndex] = score;
    }
    softmaxInPlace(logits);
    return Array.from(logits);
}
//# sourceMappingURL=logisticInference.js.map