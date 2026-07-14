import { of, throwError, Subject } from 'rxjs';
import { CloudComponent } from './cloud.component';
import { CloudService } from '../../services/cloud.service';
import { ScanJobDto } from '../../models/dtos/ScanJobDto';

/**
 * Exercises the folder virus-scan state machine end to end with a mocked
 * CloudService and Jasmine's fake clock driving the poll timer. Covers the
 * running/completed transitions, disabled/unreachable-scanner detection, the
 * clean result, rate-limit and expired-job errors, and that polling stops on a
 * terminal status or when the dialog closes (including a close that races the
 * initial start request).
 */
describe('CloudComponent virus scan', () => {
  let component: CloudComponent;
  let cloudMock: jasmine.SpyObj<CloudService>;

  const runningJob: ScanJobDto = {
    jobId: 'job-1',
    path: '',
    status: 'RUNNING',
    filesScanned: 2,
    infectedCount: 0,
  };

  const noopToast = {
    success: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  beforeEach(() => {
    jasmine.clock().install();
    cloudMock = jasmine.createSpyObj<CloudService>('CloudService', [
      'startFolderScan',
      'getScanJob',
    ]);
    component = new CloudComponent(
      cloudMock,
      {} as never,
      noopToast as never,
      {} as never,
      {} as never,
    );
    component.rootPath = '/root';
    component.currentFolder = { path: '/root', name: 'root' } as never;
  });

  afterEach(() => jasmine.clock().uninstall());

  it('polls until COMPLETED, then stops and exposes infected findings', () => {
    cloudMock.startFolderScan.and.returnValue(of({ ...runningJob }));
    const stillRunning: ScanJobDto = { ...runningJob, filesScanned: 3 };
    const completed: ScanJobDto = {
      jobId: 'job-1',
      path: '',
      status: 'COMPLETED',
      filesScanned: 3,
      infectedCount: 1,
      findings: [{ path: 'a/evil.exe', verdict: 'INFECTED', detail: 'Eicar' }],
    };
    cloudMock.getScanJob.and.returnValues(of(stillRunning), of(completed));

    component.scanCurrentFolder();
    expect(component.scanning).toBeTrue();
    expect(component.scanJob?.status).toBe('RUNNING');

    jasmine.clock().tick(1200); // first poll -> still running -> reschedule
    expect(component.scanning).toBeTrue();

    jasmine.clock().tick(1200); // second poll -> completed
    expect(component.scanning).toBeFalse();
    expect(component.scanJob?.status).toBe('COMPLETED');
    expect(component.scanInfectedFindings.length).toBe(1);
    expect(component.scanNoThreats).toBeFalse();

    const callsSoFar = cloudMock.getScanJob.calls.count();
    jasmine.clock().tick(6000); // terminal: must not poll again
    expect(cloudMock.getScanJob.calls.count()).toBe(callsSoFar);
  });

  it('detects a disabled scanner (every file errored) with a clear message', () => {
    cloudMock.startFolderScan.and.returnValue(of({ ...runningJob }));
    cloudMock.getScanJob.and.returnValue(
      of({
        jobId: 'job-1',
        path: '',
        status: 'COMPLETED',
        filesScanned: 2,
        infectedCount: 0,
        findings: [
          {
            path: 'a.txt',
            verdict: 'ERROR',
            detail: 'virus scanning is disabled',
          },
          {
            path: 'b.txt',
            verdict: 'ERROR',
            detail: 'virus scanning is disabled',
          },
        ],
      }),
    );

    component.scanCurrentFolder();
    jasmine.clock().tick(1200);

    expect(component.scanScannerUnavailable).toBeTrue();
    expect(component.scanUnavailableMessage).toContain('turned off');
    expect(component.scanNoThreats).toBeFalse();
  });

  it('treats an unreachable scanner as unavailable (no "disabled" detail)', () => {
    cloudMock.startFolderScan.and.returnValue(of({ ...runningJob }));
    cloudMock.getScanJob.and.returnValue(
      of({
        jobId: 'job-1',
        path: '',
        status: 'COMPLETED',
        filesScanned: 1,
        infectedCount: 0,
        findings: [
          { path: 'a.txt', verdict: 'ERROR', detail: 'connection refused' },
        ],
      }),
    );

    component.scanCurrentFolder();
    jasmine.clock().tick(1200);

    expect(component.scanScannerUnavailable).toBeTrue();
    expect(component.scanUnavailableMessage).toContain('unavailable');
  });

  it('reports a clean scan as no threats', () => {
    cloudMock.startFolderScan.and.returnValue(of({ ...runningJob }));
    cloudMock.getScanJob.and.returnValue(
      of({
        jobId: 'job-1',
        path: '',
        status: 'COMPLETED',
        filesScanned: 4,
        infectedCount: 0,
        findings: [],
      }),
    );

    component.scanCurrentFolder();
    jasmine.clock().tick(1200);

    expect(component.scanNoThreats).toBeTrue();
    expect(component.scanScannerUnavailable).toBeFalse();
    expect(component.scanInfectedFindings.length).toBe(0);
  });

  it('surfaces a rate-limit (429) on start and never polls', () => {
    cloudMock.startFolderScan.and.returnValue(
      throwError(() => ({ status: 429 })),
    );

    component.scanCurrentFolder();

    expect(component.scanning).toBeFalse();
    expect(component.scanError).toContain('wait');
    jasmine.clock().tick(6000);
    expect(cloudMock.getScanJob).not.toHaveBeenCalled();
  });

  it('handles an expired job (404) during polling', () => {
    cloudMock.startFolderScan.and.returnValue(of({ ...runningJob }));
    cloudMock.getScanJob.and.returnValue(throwError(() => ({ status: 404 })));

    component.scanCurrentFolder();
    jasmine.clock().tick(1200);

    expect(component.scanning).toBeFalse();
    expect(component.scanError).toContain('no longer available');
  });

  it('stops polling once the dialog is closed mid-scan', () => {
    cloudMock.startFolderScan.and.returnValue(of({ ...runningJob }));
    cloudMock.getScanJob.and.returnValue(of({ ...runningJob })); // never terminal

    component.scanCurrentFolder();
    jasmine.clock().tick(1200);
    const calls = cloudMock.getScanJob.calls.count();

    component.onScanDialogHide();
    jasmine.clock().tick(6000);

    expect(cloudMock.getScanJob.calls.count()).toBe(calls);
  });

  it('does not start polling if closed while the start request is in flight', () => {
    const start$ = new Subject<ScanJobDto>();
    cloudMock.startFolderScan.and.returnValue(start$.asObservable());
    cloudMock.getScanJob.and.returnValue(of({ ...runningJob }));

    component.scanCurrentFolder(); // POST in flight
    component.onScanDialogHide(); // user closes before it resolves
    start$.next({ ...runningJob }); // POST resolves late
    start$.complete();
    jasmine.clock().tick(6000);

    expect(cloudMock.getScanJob).not.toHaveBeenCalled();
  });
});
