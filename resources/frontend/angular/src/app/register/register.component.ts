import { Component, Inject, OnInit, Renderer2 } from '@angular/core';
import {
  UntypedFormBuilder,
  UntypedFormGroup,
  Validators,
} from '@angular/forms';
import { BaseComponent } from '../base.component';
import { Router } from '@angular/router';
import { UserAuth } from '@core/domain-classes/user-auth';
import { SecurityService } from '@core/security/security.service';
import { ToastrService } from 'ngx-toastr';
import { CommonError } from '@core/error-handler/common-error';
import { Direction } from '@angular/cdk/bidi';
import { TranslationService } from '@core/services/translation.service';
import { DOCUMENT } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { CommonService } from '@core/services/common.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent extends BaseComponent implements OnInit {
  registerFormGroup: UntypedFormGroup;
  logoImage: string = '';
  bannerImage: string = '';
  direction: Direction = 'ltr';
  departments: any[] = [];
  positions: any[] = [];
  roles: any[] = [];

  constructor(
    private router: Router,
    private fb: UntypedFormBuilder,
    private translateService: TranslateService,
    private translationService: TranslationService,
    private toastr: ToastrService,
    private securityService: SecurityService,
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document,
    private matDialogRef: MatDialog,
    private commonService: CommonService
  ) {
    super();
    this.companyProfileSubscription();
    this.getLangDir();
    this.loadDepartments();
    this.loadPositions();
    this.loadRoles();
  }

  ngOnInit(): void {
    this.matDialogRef.closeAll();
    this.createRegisterForm();
  }

  private loadDepartments(): void {
    // TODO: Replace with actual API call
    this.departments = [
      { id: 1, name: 'Department 1' },
      { id: 2, name: 'Department 2' },
      { id: 3, name: 'Department 3' }
    ];
  }

  private loadPositions(): void {
    // TODO: Replace with actual API call
    this.positions = [
      { id: 1, name: 'Position 1' },
      { id: 2, name: 'Position 2' },
      { id: 3, name: 'Position 3' }
    ];
  }

  private loadRoles(): void {
    // TODO: Replace with actual API call
    this.roles = [
      { id: 1, name: 'Role 1' },
      { id: 2, name: 'Role 2' },
      { id: 3, name: 'Role 3' }
    ];
  }

  getLangDir() {
    this.sub$.sink = this.translationService.lanDir$.subscribe(
      (c: Direction) => {
        this.direction = c;
        if (this.direction == 'rtl') {
          this.renderer.addClass(this.document.body, 'rtl');
        } else {
          this.renderer.removeClass(this.document.body, 'rtl');
        }
      }
    );
  }

  companyProfileSubscription() {
    this.securityService.companyProfile.subscribe((profile) => {
      if (profile) {
        this.logoImage = profile.logoUrl;
        this.bannerImage = profile.bannerUrl;
      }
    });
  }

  private createRegisterForm(): void {
    this.registerFormGroup = this.fb.group({
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      phoneNumber: ['', [Validators.required]],
      department: ['', [Validators.required]],
      position: ['', [Validators.required]],
      roles: ['', [Validators.required]],
      address: ['', [Validators.required]],
      dateOfBirth: ['', [Validators.required]],
      employeeId: ['', [Validators.required]],
      password: ['', [Validators.required]],
      confirmPassword: ['', [Validators.required]]
    }, { validator: this.passwordMatchValidator });
  }

  private passwordMatchValidator(g: UntypedFormGroup) {
    return g.get('password').value === g.get('confirmPassword').value
      ? null : { 'passwordMismatch': true };
  }

  onRegisterSubmit(): void {
    if (this.registerFormGroup.valid) {
      const formData = this.registerFormGroup.value;
      // Here you would typically call your registration service
      console.log('Form submitted:', formData);
      this.toastr.success(this.translateService.instant('REGISTRATION_SUCCESSFUL'));
      this.router.navigate(['/login']);
    } else {
      Object.keys(this.registerFormGroup.controls).forEach(key => {
        const control = this.registerFormGroup.get(key);
        if (control.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  getAllAllowFileExtension() {
    this.commonService
      .getAllowFileExtensions()
      .subscribe();
  }
}
