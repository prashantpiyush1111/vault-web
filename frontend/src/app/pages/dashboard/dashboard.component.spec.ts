import { fakeAsync, tick } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { of, Subject } from 'rxjs';
import { UserDashboardDto } from '../../models/dtos/UserDashboardDto';
import { AuthService } from '../../services/auth.service';
import { DashboardService } from '../../services/dashboard.service';
import { UserService } from '../../services/user.service';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  const dashboard: UserDashboardDto = {
    profile: {
      id: 1,
      username: 'alice',
      groupCount: 0,
      privateChatCount: 0,
      messagesSent: 0,
      profilePicture: '/uploads/alice.png',
    },
    groups: [],
    privateChats: [],
    polls: [],
    recentMessages: [],
  };

  let dashboardService: jasmine.SpyObj<DashboardService>;
  let userService: jasmine.SpyObj<UserService>;
  let component: DashboardComponent;

  beforeEach(() => {
    dashboardService = jasmine.createSpyObj<DashboardService>(
      'DashboardService',
      ['getDashboard'],
    );
    userService = jasmine.createSpyObj<UserService>('UserService', [
      'getProfilePicture',
      'getProfilePictureUrl',
      'uploadProfilePicture',
      'deleteProfilePicture',
    ]);
    dashboardService.getDashboard.and.returnValue(of(dashboard));
    userService.getProfilePictureUrl.and.returnValue(
      'https://example.test/uploads/alice.png',
    );

    component = new DashboardComponent(
      dashboardService,
      new FormBuilder(),
      jasmine.createSpyObj<AuthService>('AuthService', [
        'getUsername',
        'changePassword',
      ]),
      jasmine.createSpyObj('Router', ['navigate']),
      userService,
    );
  });

  it('uses the dashboard payload for the profile picture', () => {
    component.ngOnInit();

    expect(dashboardService.getDashboard).toHaveBeenCalledTimes(1);
    expect(userService.getProfilePicture).not.toHaveBeenCalled();
    expect(userService.getProfilePictureUrl).toHaveBeenCalledWith(
      '/uploads/alice.png',
    );
    expect(component.profilePictureUrl).toBe(
      'https://example.test/uploads/alice.png',
    );
  });

  it('cancels the deferred success reset when destroyed', fakeAsync(() => {
    userService.deleteProfilePicture.and.returnValue(of(void 0));

    component.removeProfilePicture();
    expect(component.pictureSuccess).toBe('Profile picture removed.');

    component.ngOnDestroy();
    tick(4000);

    expect(component.pictureSuccess).toBe('Profile picture removed.');
  }));

  it('ignores a profile-picture response received after destroy', fakeAsync(() => {
    const deleteResult = new Subject<void>();
    userService.deleteProfilePicture.and.returnValue(deleteResult);

    component.removeProfilePicture();
    component.ngOnDestroy();
    deleteResult.next();
    deleteResult.complete();
    tick(4000);

    expect(component.pictureSuccess).toBe('');
  }));
});
