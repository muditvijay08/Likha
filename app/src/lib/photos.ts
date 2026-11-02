// Stock photos (Pexels, free licence), used as mood images only: never as a member, never with a name, quote or
// "they met on Likha". All from one Pexels shoot so the people look consistent. To swap one, change its id here.
export const PHOTOS = {
  laugh:  { id: 4307925, alt: "A young couple laughing together on a sofa" },
  chai:   { id: 4307800, alt: "A couple talking over cups of tea" },
  talk:   { id: 4307726, alt: "A couple chatting at home on a weekend" },
  her:    { id: 4307697, alt: "A young woman in Indian clothes smiling at her phone" },
  him:    { id: 4307663, alt: "A young man smiling while messaging on his phone" },
} as const;
export type PhotoKey = keyof typeof PHOTOS;

export const pexels = (id: number, w: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;
export const pexelsSet = (id: number) => [480, 800, 1200].map((w) => `${pexels(id, w)} ${w}w`).join(", ");
