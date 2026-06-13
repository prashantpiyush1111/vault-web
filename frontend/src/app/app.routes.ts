import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { authGuard } from './auth.guard';
import { HomeComponent } from './pages/home/home.component';
import { RegisterComponent } from './pages/register/register.component';
import { CloudComponent } from './pages/cloud/cloud.component';
import { TrashComponent } from './pages/cloud/trash/trash.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { PasswordManagerComponent } from './pages/password-manager/password-manager.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: HomeComponent, canActivate: [authGuard] },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
  },
  {
    path: 'passwords',
    component: PasswordManagerComponent,
    canActivate: [authGuard],
  },
  { path: 'password-manager', redirectTo: 'passwords', pathMatch: 'full' },
  { path: 'register', component: RegisterComponent },
  { path: 'cloud', component: CloudComponent, canActivate: [authGuard] },
  { path: 'cloud/trash', component: TrashComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'login' },
];
