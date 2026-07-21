import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError, Subject } from 'rxjs';
import { CloudComponent } from './cloud.component';
import { CloudService } from '../../services/cloud.service';
import { UiToastService } from '../../core/services/ui-toast.service';
import { ScanJobDto } from '../../models/dtos/ScanJobDto';
import { SecureSendLinkDto } from '../../models/dtos/SecureSendLinkDto';

/**
 * Exercises the folder virus-scan state machine end to end with a mocked
 * CloudService and Jasmine's fake clock driving the poll timer.
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

  it('keeps the scan alive when polling is rate limited, and still completes', () => {
    cloudMock.startFolderScan.and.returnValue(of({ ...runningJob }));
    // throttled once, then the backend lets us through again
    cloudMock.getScanJob.and.returnValues(
      throwError(() => ({ status: 429 })),
      of({ ...runningJob, status: 'COMPLETED', findings: [] }),
    );

    component.scanCurrentFolder();
    jasmine.clock().tick(1200); // first poll -> 429

    expect(component.scanning).toBeTrue();
    expect(component.scanError).toBeUndefined();

    jasmine.clock().tick(5000); // backoff elapses -> poll succeeds
    expect(component.scanning).toBeFalse();
    expect(component.scanError).toBeUndefined();
    expect(component.scanJob?.status).toBe('COMPLETED');
  });

  it('gives up on a persistently rate-limited scan without claiming it failed', () => {
    cloudMock.startFolderScan.and.returnValue(of({ ...runningJob }));
    cloudMock.getScanJob.and.returnValue(throwError(() => ({ status: 429 })));

    component.scanCurrentFolder();
    jasmine.clock().tick(1200); // first poll
    jasmine.clock().tick(5000 * 5); // exhaust the retries

    expect(component.scanning).toBeFalse();
    expect(component.scanError).toContain('may still be running');
    expect(cloudMock.getScanJob).toHaveBeenCalledTimes(6); // initial + 5 retries
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

describe('CloudComponent Secure Send Flow', () => {
  let component: CloudComponent;
  let fixture: ComponentFixture<CloudComponent>;
  let cloudServiceSpy: jasmine.SpyObj<CloudService>;
  let toastSpy: jasmine.SpyObj<UiToastService>;

  beforeEach(async () => {
    cloudServiceSpy = jasmine.createSpyObj('CloudService', [
      'getRootFolder',
      'getFolderByPath',
      'getFolderContent',
      'createSecureSendLink',
      'listSecureSendLinks',
      'revokeSecureSendLink',
    ]);

    cloudServiceSpy.getRootFolder.and.returnValue(
      of({ id: 'root', name: 'Root', path: '/' } as any),
    );
    cloudServiceSpy.getFolderContent.and.returnValue(
      of({ content: [], totalElements: 0, totalPages: 0, page: 0 } as any),
    );

    toastSpy = jasmine.createSpyObj('UiToastService', [
      'success',
      'error',
      'info',
      'warn',
    ]);

    await TestBed.configureTestingModule({
      imports: [
        CloudComponent,
        HttpClientTestingModule,
        RouterTestingModule,
        NoopAnimationsModule,
      ],
      providers: [
        { provide: CloudService, useValue: cloudServiceSpy },
        { provide: UiToastService, useValue: toastSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CloudComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should open create share link dialog for a file', () => {
    component.openCreateShareDialog('/file.txt', 'file.txt');
    expect(component.selectedFileForShare).toEqual({
      path: '/file.txt',
      name: 'file.txt',
    });
    expect(component.showCreateShareDialog).toBeTrue();
    expect(component.shareExpiryMinutes).toBe(1440);
  });

  it('should create a secure send link and open generated URL dialog on success', () => {
    component.selectedFileForShare = { path: '/doc.pdf', name: 'doc.pdf' };
    component.shareExpiryMinutes = 60;
    component.sharePassword = 'pass';

    const mockLink: SecureSendLinkDto = {
      id: 's1',
      filePath: '/doc.pdf',
      fileName: 'doc.pdf',
      shareUrl: 'http://localhost/share/s1',
      expiresAt: '2026-07-21T00:00:00Z',
      createdAt: '2026-07-20T00:00:00Z',
    };

    cloudServiceSpy.createSecureSendLink.and.returnValue(of(mockLink));

    component.submitCreateShareLink();

    expect(cloudServiceSpy.createSecureSendLink).toHaveBeenCalledWith(
      '/doc.pdf',
      60,
      'pass',
    );
    expect(component.createdShareUrl).toBe('http://localhost/share/s1');
    expect(component.showCreateShareDialog).toBeFalse();
    expect(component.showGeneratedLinkDialog).toBeTrue();
    expect(toastSpy.success).toHaveBeenCalledWith(
      'Share link created',
      'Link for "doc.pdf" created successfully.',
    );
  });

  it('should handle rate limit error (HTTP 429) when creating share link', () => {
    component.selectedFileForShare = { path: '/doc.pdf', name: 'doc.pdf' };
    cloudServiceSpy.createSecureSendLink.and.returnValue(
      throwError(() => ({ status: 429, message: 'Too Many Requests' })),
    );

    component.submitCreateShareLink();

    expect(toastSpy.error).toHaveBeenCalledWith(
      'Rate limit reached',
      'Too many share links created. Please wait before trying again.',
    );
  });

  it('should load active share links in dialog', () => {
    const mockLinks: SecureSendLinkDto[] = [
      {
        id: 'link1',
        filePath: '/a.txt',
        fileName: 'a.txt',
        expiresAt: '2026-07-25T00:00:00Z',
        createdAt: '2026-07-20T00:00:00Z',
      },
    ];

    cloudServiceSpy.listSecureSendLinks.and.returnValue(of(mockLinks));

    component.openSharedLinksDialog();

    expect(component.showSharedLinksDialog).toBeTrue();
    expect(component.sharedLinks).toEqual(mockLinks);
  });

  it('should revoke a share link and update UI state', () => {
    const link: SecureSendLinkDto = {
      id: 'link1',
      filePath: '/a.txt',
      fileName: 'a.txt',
      expiresAt: '2026-07-25T00:00:00Z',
      createdAt: '2026-07-20T00:00:00Z',
      isRevoked: false,
    };

    cloudServiceSpy.revokeSecureSendLink.and.returnValue(of(void 0));

    component.revokeShareLink(link);

    expect(cloudServiceSpy.revokeSecureSendLink).toHaveBeenCalledWith('link1');
    expect(link.isRevoked).toBeTrue();
    expect(toastSpy.success).toHaveBeenCalledWith(
      'Link revoked',
      'Share link for "a.txt" was revoked.',
    );
  });
});

/**
 * The unsaved-changes guard on the Cloud file editor: every exit path (Cancel,
 * the dialog dismiss, and a full-page leave) must confirm before discarding
 * edits, and a clean editor must close without a prompt.
 */
describe('CloudComponent unsaved-edit guard', () => {
  let component: CloudComponent;
  let confirmMock: jasmine.SpyObj<{ confirm: (config: unknown) => void }>;

  beforeEach(() => {
    confirmMock = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    component = new CloudComponent(
      {} as never,
      confirmMock as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  // Open the editor on a file whose loaded content is `content` (not yet dirty).
  function openEditor(content: string): void {
    component.showFileEditor = true;
    component.fileContent = content;
    component.originalFileContent = content;
  }

  function acceptLastConfirm(): void {
    const config = confirmMock.confirm.calls.mostRecent().args[0] as {
      accept: () => void;
    };
    config.accept();
  }

  it('closes without asking when the editor has no unsaved edits', () => {
    openEditor('hello');
    component.requestCloseFileEditor();
    expect(confirmMock.confirm).not.toHaveBeenCalled();
    expect(component.showFileEditor).toBeFalse();
  });

  it('asks before discarding, and only closes once Discard is confirmed', () => {
    openEditor('hello');
    component.fileContent = 'hello world'; // dirty

    component.requestCloseFileEditor();
    expect(confirmMock.confirm).toHaveBeenCalledTimes(1);
    expect(component.showFileEditor).toBeTrue(); // stays open until confirmed

    acceptLastConfirm();
    expect(component.showFileEditor).toBeFalse();
    expect(component.fileContent).toBe(''); // editor state fully reset
  });

  it('reverses a dialog dismiss and confirms when there are unsaved edits', () => {
    openEditor('hello');
    component.fileContent = 'changed';
    component.showFileEditor = false; // the dismiss already flipped visible off

    component.onFileEditorHide();

    expect(component.showFileEditor).toBeTrue(); // reopened
    expect(confirmMock.confirm).toHaveBeenCalledTimes(1);
  });

  it('lets a clean dialog dismiss close with no prompt', () => {
    openEditor('hello');
    component.showFileEditor = false;

    component.onFileEditorHide();

    expect(confirmMock.confirm).not.toHaveBeenCalled();
    expect(component.showFileEditor).toBeFalse();
  });

  it('blocks a full-page leave only while there are unsaved edits', () => {
    openEditor('hello');
    const clean = {
      preventDefault: jasmine.createSpy('preventDefault'),
      returnValue: '',
    } as unknown as BeforeUnloadEvent;
    component.warnBeforeUnload(clean);
    expect(clean.preventDefault).not.toHaveBeenCalled();

    component.fileContent = 'changed';
    const dirty = {
      preventDefault: jasmine.createSpy('preventDefault'),
      returnValue: '',
    } as unknown as BeforeUnloadEvent;
    component.warnBeforeUnload(dirty);
    expect(dirty.preventDefault).toHaveBeenCalled();
  });
});
