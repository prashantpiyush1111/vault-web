import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/internal/operators/filter';
import { NavbarComponent } from './navbar/navbar.component';
import { ThemeService } from './services/theme.service';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, NavbarComponent, ToastModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  showNavbar = false;

  constructor(
    private router: Router,
    public themeService: ThemeService,
  ) {
    const noNavbarRoutes = ['/login', '/register', '/not-found', '/error'];
    this.showNavbar = !noNavbarRoutes.includes(this.router.url);
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        // show navbar if not on auth or error pages
        this.showNavbar = !noNavbarRoutes.includes(event.urlAfterRedirects);
      });
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  get isDarkTheme(): boolean {
    return this.themeService.getCurrentTheme() === 'dark';
  }
}
