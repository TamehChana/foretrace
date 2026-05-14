/**
 * Small-vector softmax multinomial logistic regression + binary logistic head.
 * Used offline to fit `risk-ml-v1.weights.json` and at runtime for inference only.
 */

export type MultinomialWeights = {
  /** Shape: numClasses × (featureDim + 1), last column is bias absorbed in dot — rows are class weight vectors over augmented x */
  W: number[][];
};

export type BinaryLogisticWeights = {
  w: number[];
};

export function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((z) => Math.exp(z - max));
  const s = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / s);
}

export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i] * b[i];
  }
  return s;
}

export function predictMultinomialProbs(W: number[][], xAug: number[]): number[] {
  const logits = W.map((row) => dot(row, xAug));
  return softmax(logits);
}

export function predictBinaryProb(w: number[], xAug: number[]): number {
  const z = dot(w, xAug);
  return 1 / (1 + Math.exp(-z));
}

/** One-hot cross-entropy gradient for softmax row: (p - y) ⊗ x */
export function trainMultinomialOneStep(
  W: number[][],
  xAug: number[],
  classIndex: number,
  lr: number,
): void {
  const probs = predictMultinomialProbs(W, xAug);
  for (let k = 0; k < W.length; k++) {
    const err = probs[k] - (k === classIndex ? 1 : 0);
    for (let j = 0; j < xAug.length; j++) {
      W[k][j] -= lr * err * xAug[j];
    }
  }
}

export function trainBinaryOneStep(
  w: number[],
  xAug: number[],
  y: 0 | 1,
  lr: number,
): void {
  const p = predictBinaryProb(w, xAug);
  const err = p - y;
  for (let j = 0; j < xAug.length; j++) {
    w[j] -= lr * err * xAug[j];
  }
}
