import random from 'math-random';

export default function uniqueID() {
  return random().toString(36).substring(2, 7);
}
