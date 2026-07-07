export interface SearchResultDto {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  mimeType: string | null;
  lastModifiedAt: number;
  score: number;
}
