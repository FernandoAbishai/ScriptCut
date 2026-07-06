import type { Word } from '../types/project';

export type SpeakerStat = {
  speaker: string;
  wordCount: number;
  startTime: number;
  endTime: number;
  duration: number;
  wordIndices: number[];
};

export function getSpeakerStats(words: Word[]): SpeakerStat[] {
  const bySpeaker = new Map<string, SpeakerStat>();
  words.forEach((word, index) => {
    const speaker = word.speaker?.trim();
    if (!speaker) return;
    const current = bySpeaker.get(speaker);
    if (!current) {
      bySpeaker.set(speaker, {
        speaker,
        wordCount: 1,
        startTime: word.start,
        endTime: word.end,
        duration: Math.max(0, word.end - word.start),
        wordIndices: [index],
      });
      return;
    }
    current.wordCount += 1;
    current.startTime = Math.min(current.startTime, word.start);
    current.endTime = Math.max(current.endTime, word.end);
    current.duration += Math.max(0, word.end - word.start);
    current.wordIndices.push(index);
  });

  return Array.from(bySpeaker.values()).sort((a, b) => a.speaker.localeCompare(b.speaker));
}

export function formatSpeakerDuration(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const mins = Math.floor(safeSeconds / 60);
  const secs = Math.round(safeSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
