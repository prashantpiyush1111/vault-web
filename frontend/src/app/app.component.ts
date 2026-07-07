import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterOutlet,
} from '@angular/router';
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
    private activatedRoute: ActivatedRoute,
    public themeService: ThemeService,
  ) {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        // Derive navbar visibility from the active route's data, not the raw URL.
        // This correctly handles the wildcard (**) route where the URL is the
        // unknown path (e.g. /blah) rather than /not-found.
        let route = this.activatedRoute;
        while (route.firstChild) {
          route = route.firstChild;
        }
        this.showNavbar = !route.snapshot.data['hideNavbar'];
      });
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  get isDarkTheme(): boolean {
    return this.themeService.getCurrentTheme() === 'dark';
  }
}
