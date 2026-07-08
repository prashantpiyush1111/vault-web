import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  Validators,
  AbstractControl,
  ReactiveFormsModule,
  AsyncValidatorFn,
  ValidationErrors,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';
import { Observable, of } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  map,
  first,
} from 'rxjs/operators';
import { extractApiErrorPayload } from '../../core/utils/api-error.util';
import { UiToastService } from '../../core/services/ui-toast.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent implements OnInit {
  submitted = false;
  errorMessage = '';
  showPassword = false;
  showConfirmPassword = false;

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  registerForm!: ReturnType<FormBuilder['group']>;

  // Password rule: 1 uppercase, 1 digit, 1 special char
  private readonly PASSWORD_COMPLEXITY =
    /(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+/;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private toast: UiToastService,
  ) {}

  ngOnInit(): void {
    this.registerForm = this.fb.group(
      {
        username: [
          '',
          {
            validators: [Validators.required],
            asyncValidators: [this.usernameExistsValidator(this.auth)],
            updateOn: 'blur',
          },
        ],
        password: [
          '',
          [
            Validators.required,
            Validators.minLength(8),
            Validators.pattern(this.PASSWORD_COMPLEXITY),
          ],
        ],
        confirmPassword: ['', Validators.required],
      },
      { validators: this.passwordMatchValidator },
    );
  }

  get f(): { [key: string]: AbstractControl } {
    return this.registerForm.controls;
  }

  // Validate password === confirmPassword
  passwordMatchValidator(group: AbstractControl) {
    const pw = group.get('password')?.value;
    const cpw = group.get('confirmPassword')?.value;
    return pw === cpw ? null : { mismatch: true };
  }

  onSubmit(): void {
    this.submitted = true;
    this.errorMessage = '';

    if (this.registerForm.invalid) return;

    const { username, password } = this.registerForm.value;

    this.auth.register(username!, password!).subscribe({
      next: () => {
        this.toast.success(
          'Registration successful',
          'You can now log in with your new account.',
        );
        this.router.navigate(['/login']);
      },
      error: (err) => {
        const apiError = extractApiErrorPayload(err);
        const message =
          apiError?.code === 'USERNAME_TAKEN'
            ? 'Dieser Benutzername ist bereits vergeben.'
            : apiError?.message || 'Registration failed. Try again.';
        this.toast.error('Registration failed', message);
      },
    });
  }

  usernameExistsValidator(authService: AuthService): AsyncValidatorFn {
    return (control): Observable<ValidationErrors | null> => {
      if (!control.value) return of(null);

      return of(control.value).pipe(
        debounceTime(400),
        distinctUntilChanged(),
        switchMap((username) => authService.checkUsernameExists(username)),
        map((exists) => (exists ? { usernameTaken: true } : null)),
        first(),
      );
    };
  }
}
