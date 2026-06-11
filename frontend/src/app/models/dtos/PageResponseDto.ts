export interface PageResponseDto<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  pageNumber: number;
}
