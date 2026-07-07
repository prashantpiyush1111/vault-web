export interface FolderContentItemDto {
  name: string;
  path: string;
  directory: boolean;
  size: number;
  mimeType: string | null;
  lastModifiedAt: number;
}
