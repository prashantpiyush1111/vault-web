import { FileScanResultDto } from './FileScanResultDto';

export type ScanStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface ScanJobDto {
  jobId: string;
  path: string;
  status: ScanStatus;
  createdAt?: string;
  finishedAt?: string;
  filesScanned: number;
  infectedCount: number;
  error?: string;
  findings?: FileScanResultDto[];
}
