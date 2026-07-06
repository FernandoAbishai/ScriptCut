import type { Word } from '../types/project';

export type TranscriptSearchMatch = {
  startIndex: number;
  endIndex: number;
  text: string;
};

export function findTranscriptMatches(words: Word[], query: string): TranscriptSearchMatch[] {
  const terms = normalizeQuery(query);
  if (words.length === 0 || terms.length === 0) return [];

  const normalizedWords = words.map((word) => normalizeToken(word.word));
  const matches: TranscriptSearchMatch[] = [];

  for (let index = 0; index < normalizedWords.length; index++) {
    if (terms.length === 1) {
      if (!normalizedWords[index].includes(terms[0])) continue;
      matches.push({
        startIndex: index,
        endIndex: index,
        text: words[index].word,
      });
      continue;
    }

    const endIndex = index + terms.length - 1;
    if (endIndex >= normalizedWords.length) break;
    const phraseMatches = terms.every((term, offset) => normalizedWords[index + offset] === term);
    if (!phraseMatches) continue;
    matches.push({
      startIndex: index,
      endIndex,
      text: words.slice(index, endIndex + 1).map((word) => word.word).join(' '),
    });
  }

  return matches;
}

function normalizeQuery(query: string) {
  return query
    .trim()
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
}

function normalizeToken(token: string) {
  return token.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/gi, '');
}
