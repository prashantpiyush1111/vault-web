export interface SearchResultDto {
  name: string;
  path: string;
  type: string;
  size: number;
  mimeType: string | null;
  lastModifiedAt: number;
  score: number;
}
