import { Component, OnInit, inject } from '@angular/core';
import {
  UntypedFormBuilder,
  UntypedFormGroup,
  Validators,
} from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { User } from '@core/domain-classes/user';
import { UserAuth } from '@core/domain-classes/user-auth';
import { SecurityService } from '@core/security/security.service';
import { TranslationService } from '@core/services/translation.service';
import { ToastrService } from 'ngx-toastr';
import { BaseComponent } from 'src/app/base.component';
import { ChangePasswordComponent } from '../change-password/change-password.component';
import { UserService } from '../user.service';
import { CategoryStore } from 'src/app/category/store/category-store';
import { PositionStore } from 'src/app/position/store/position-store';
import { CommonService } from '@core/services/common.service';
import { Role } from '@core/domain-classes/role';
import { catchError, forkJoin, of } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-my-profile',
  templateUrl: './my-profile.component.html',
  styleUrls: ['./my-profile.component.css'],
})
export class MyProfileComponent extends BaseComponent implements OnInit {
  userForm: UntypedFormGroup;
  user: UserAuth;
  userDetails: User;
  departmentName: string = '';
  positionName: string = '';
  userRoles: string[] = [];

  // Inject stores using inject function
  private categoryStore = inject(CategoryStore);
  private positionStore = inject(PositionStore);

  constructor(
    private router: Router,
    private fb: UntypedFormBuilder,
    private userService: UserService,
    private toastrService: ToastrService,
    private dialog: MatDialog,
    private securityService: SecurityService,
    private translationService: TranslationService,
    private commonService: CommonService,
    private httpClient: HttpClient
  ) {
    super();
  }

  ngOnInit(): void {
    this.createUserForm();
    this.user = this.securityService.getUserDetail();
    
    if (this.user) {
      // Load all required data in parallel
      forkJoin({
        categories: of(this.categoryStore.loadByCategory()),
        positions: of(this.positionStore.loadByPosition()),
        userDetails: this.userService.getUser(this.user.user.id).pipe(
          catchError(() => of(this.user.user))  // If user details fetch fails, use basic user info
        ),
        userPosition: this.httpClient.get<{dept: string, pst: string}>('api/user-position').pipe(
          catchError(() => of({dept: '', pst: ''}))  // If position fetch fails, use empty strings
        ),
        userRoles: this.httpClient.get<{roles: string[]}>('api/user-roles').pipe(
          catchError(() => of({roles: []}))  // If roles fetch fails, use empty array
        )
      }).subscribe(results => {
        // Set user details and form values
        this.userDetails = results.userDetails as User;
        this.userForm.patchValue(this.userDetails || this.user.user);
        
        // Set department name from API response
        this.departmentName = results.userPosition.dept;
        this.userForm.get('department').setValue(this.departmentName);
        
        // Set position name from API response
        this.positionName = results.userPosition.pst;
        this.userForm.get('position').setValue(this.positionName);
        
        // Set roles from API response
        this.userRoles = results.userRoles.roles;
      });
    }
  }

  createUserForm() {
    this.userForm = this.fb.group({
      id: [''],
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      email: [{ value: '', disabled: true }, [Validators.required, Validators.email]],
      phoneNumber: ['', [Validators.required]],
      department: [{ value: '', disabled: true }],
      position: [{ value: '', disabled: true }],
      roles: [{ value: '', disabled: true }]
    });
  }

  updateProfile() {
    if (this.userForm.valid) {
      const user = this.createBuildObject();
      this.sub$.sink = this.userService
        .updateUserProfile(user)
        .subscribe((user: User) => {
          this.user.user.firstName = user.firstName;
          this.user.user.lastName = user.lastName;
          this.user.user.phoneNumber = user.phoneNumber;
          this.toastrService.success(
            this.translationService.getValue('PROFILE_UPDATED_SUCCESSFULLY')
          );
          this.securityService.setUserDetail(this.user);
          this.router.navigate(['/']);
        });
    } else {
      this.userForm.markAllAsTouched();
    }
  }

  createBuildObject(): User {
    const user: User = {
      id: this.userForm.get('id').value,
      firstName: this.userForm.get('firstName').value,
      lastName: this.userForm.get('lastName').value,
      email: this.userForm.get('email').value,
      phoneNumber: this.userForm.get('phoneNumber').value,
      userName: this.userForm.get('email').value,
    };
    return user;
  }

  changePassword(): void {
    this.dialog.open(ChangePasswordComponent, {
      width: '350px',
      data: Object.assign({}, this.user.user),
    });
  }
}
