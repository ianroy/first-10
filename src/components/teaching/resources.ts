import manifestSource from "../../../public/teaching/resources.json?raw";

type TeachingResource = {
  id: string;
  title: string;
  description: string;
  markdown: string;
  printPages: number;
  html: string;
  bytes: number;
};

type TeachingKit = {
  version: string;
  updated: string;
  requiresAccount: boolean;
  requiresAI: boolean;
  lessonMinutes: number;
  fieldDays: number;
  resources: TeachingResource[];
  printableHtml: string;
  printablePdf: string;
  printableHtmlBytes: number;
  printablePdfBytes: number;
};

// Bundle the versioned public manifest so reading the page needs no API request.
// Resource tests check these local files, sizes, handout anchors and kit version.
export const teachingKit = JSON.parse(manifestSource) as TeachingKit;

export function resourceSize(bytes: number) {
  return `${Math.ceil(bytes / 1000)} KB`;
}
