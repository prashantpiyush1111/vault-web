export type ScanVerdict = 'CLEAN' | 'INFECTED' | 'ERROR';

export interface FileScanResultDto {
  path: string;
  verdict: ScanVerdict;
  detail?: string;
}
