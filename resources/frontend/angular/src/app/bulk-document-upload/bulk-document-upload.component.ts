import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, inject, OnInit, Output, ViewChild, ElementRef } from '@angular/core';
import { ReactiveFormsModule, FormsModule, FormArray, UntypedFormGroup, FormGroup, Validators, UntypedFormBuilder, UntypedFormControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { RouterModule, Router } from '@angular/router';
import { DocumentInfo } from '@core/domain-classes/document-info';
import { TranslateModule } from '@ngx-translate/core';
import { SharedModule } from '@shared/shared.module';
import { FeatherModule } from 'angular-feather';
import { BaseComponent } from '../base.component';
import { ClientStore } from '../client/client-store';
import { CommonService } from '@core/services/common.service';
import { TranslationService } from '@core/services/translation.service';
import { DocumentService } from '../document/document.service';
import { User } from '@core/domain-classes/user';
import { Role } from '@core/domain-classes/role';
import { DocumentOperation } from '@core/domain-classes/document-operation';
import { DocumentAuditTrail } from '@core/domain-classes/document-audit-trail';
import { AllowFileExtension } from '@core/domain-classes/allow-file-extension';
import { catchError, concatMap, from, of, map } from 'rxjs';
import { NgSelectModule } from '@ng-select/ng-select';
import { Direction } from '@angular/cdk/bidi';
import { OwlDateTimeModule, OwlNativeDateTimeModule } from 'ng-pick-datetime-ex';
import { SecurityService } from '@core/security/security.service';
import { CategoryStore } from '../category/store/category-store';
import { DocumentStatusStore } from '../document-status/store/document-status.store';
import { DocumentMetaData } from '@core/domain-classes/documentMetaData';
import { HttpClient } from '@angular/common/http';
import { UserStore } from '../user/store/user-store';
import { CommonError } from '@core/error-handler/common-error';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-bulk-document-upload',
  standalone: true,
  imports: [
    TranslateModule,
    SharedModule,
    MatDialogModule,
    MatSelectModule,
    ReactiveFormsModule,
    FeatherModule,
    RouterModule,
    NgSelectModule,
    MatButtonModule,
    CommonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    FormsModule,
    OwlDateTimeModule,
    OwlNativeDateTimeModule,
  ],
  templateUrl: './bulk-document-upload.component.html',
  styleUrl: './bulk-document-upload.component.scss'
})
export class BulkDocumentUploadComponent extends BaseComponent implements OnInit {
  documentForm: UntypedFormGroup;
  extension = '';
  users: User[];
  roles: Role[];
  allowFileExtension: AllowFileExtension[] = [];
  fileData: any;
  loading: boolean = false;
  resultArray: any = [];
  minDate: Date;
  isS3Supported = false;
  userDepartment: string;

  @ViewChild('file', { static: true }) fileInput!: ElementRef;
  @Output() onSaveDocument: EventEmitter<DocumentInfo> =
    new EventEmitter<DocumentInfo>();
  categoryStore = inject(CategoryStore);
  public clientStore = inject(ClientStore);
  private fb = inject(UntypedFormBuilder);
  private cd = inject(ChangeDetectorRef);
  private commonService = inject(CommonService);
  private translationService = inject(TranslationService);
  private documentService = inject(DocumentService);
  documentStatusStore = inject(DocumentStatusStore);
  private httpClient = inject(HttpClient);
  public userStore = inject(UserStore);
  counter: number;
  direction: Direction;
  document: DocumentInfo;
  private router = inject(Router);
  private toastr = inject(ToastrService);

  constructor(
    private securityService: SecurityService,
  ) {
    super();
    this.minDate = new Date();
  }

  ngOnInit(): void {
    this.loadUserDepartment();
    this.createDocumentForm();
    this.getUsers();
    this.getRoles();
    this.getAllowedFileExtensions();
    this.companyProfileSubscription();
    this.userStore.loadUserPositions();
    
    // Make sure date fields are reset on initialization
    this.resetDateFields();
    
    // Initialize date fields if autoIsTimeBound is checked
    this.initializeDateFields();
  }

  loadUserDepartment() {
    this.sub$.sink = this.httpClient.get<{dept: string, pst: string}>('api/user-position').subscribe({
      next: (response) => {
        this.userDepartment = response.dept;
        this.cd.detectChanges();
      },
      error: (error) => {
        console.error('Error fetching user department:', error);
      }
    });
  }

  get fileInputs(): FormArray {
    return (<FormArray>this.documentForm.get('files')) as FormArray;
  }

  get toUserPermissionFormGroup() {
    return this.documentForm.get('toUserPermissionForm') as FormGroup;
  }

  get userPermissionFormGroup() {
    return this.documentForm.get('userPermissionForm') as FormGroup;
  }

  get documentMetaTagsArray(): FormArray {
    return <FormArray>this.documentForm.get('documentMetaTags');
  }

  createDocumentForm() {
    this.documentForm = this.fb.group({
      name: [''],
      description: [''],
      categoryId: [''],
      url: [''],
      extension: [''],
      documentMetaTags: this.fb.array([]),
      location: [''],
      clientId: [''],
      statusId: [''],
      selectedToUsers: [],
      selectedUsers: [],
      files: this.fb.array([]),
      sendMode: ['auto_assign'],
      toUserPermissionForm: this.fb.group({
        isTimeBound: new UntypedFormControl(false),
        startDate: [''],
        endDate: [''],
        isAllowDownload: [false],
      }),
      userPermissionForm: this.fb.group({
        isTimeBound: new UntypedFormControl(false),
        startDate: [''],
        endDate: [''],
        isAllowDownload: [false],
      }),
      autoIsTimeBound: [false],
      autoStartDate: [''],
      autoEndDate: [''],
      autoIsAllowDownload: [false],
    });
    
    // Add listener for send mode changes
    this.documentForm.get('sendMode').valueChanges.subscribe(value => {
      if (value === 'auto_assign') {
        // Reset auto mode fields when switching to auto mode
        this.documentForm.get('autoIsTimeBound').setValue(false);
        this.resetDateFields();
      }
    });
    
    this.companyProfileSubscription();
  }

  onMetatagChange(event: any, index: number) {
    const email = this.documentMetaTagsArray.at(index).get('metatag').value;
    if (!email) {
      return;
    }
    const emailControl = this.documentMetaTagsArray.at(index).get('metatag');
    emailControl.setValidators([Validators.required]);
    emailControl.updateValueAndValidity();
  }

  editDocmentMetaData(documentMetatag: DocumentMetaData): FormGroup {
    return this.fb.group({
      id: [documentMetatag.id],
      documentId: [documentMetatag.documentId],
      metatag: [documentMetatag.metatag],
    });
  }

  onAddAnotherMetaTag() {
    const documentMetaTag: DocumentMetaData = {
      id: '',
      documentId: this.document && this.document.id ? this.document.id : '',
      metatag: '',
    };
    this.documentMetaTagsArray.insert(
      0,
      this.editDocmentMetaData(documentMetaTag)
    );
  }

  onDeleteMetaTag(index: number) {
    this.documentMetaTagsArray.removeAt(index);
  }

  buildDocumentMetaTag(): FormGroup {
    return this.fb.group({
      id: [''],
      documentId: [''],
      metatag: [''],
    });
  }

  companyProfileSubscription() {
    this.securityService.companyProfile.subscribe((profile) => {
      if (profile) {
        this.documentForm.get('location').setValue(profile.location ?? 'local');
      }
    });
  }

  getUsers() {
    this.sub$.sink = this.commonService
      .getUsersForDropdown()
      .subscribe((users: User[]) => (this.users = users));
  }

  getRoles() {
    this.sub$.sink = this.commonService
      .getRoles()
      .subscribe((roles: Role[]) => (this.roles = roles));
  }

  getAllowedFileExtensions() {
    this.commonService.allowFileExtension$.subscribe(
      (allowFileExtension: AllowFileExtension[]) => {
        if (allowFileExtension) {
          this.allowFileExtension = allowFileExtension;
        }
      }
    );
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.resultArray = [];
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        this.extension = file.name.split('.').pop();
        const isValidExtension = this.fileExtesionValidation(this.extension);
        this.fileInputs.push(
          this.fb.group({
            fileName: [file.name],
            file: [file],
            name: [file.name, Validators.required],
            extension: [isValidExtension ? this.extension : '', [Validators.required]],
            message: [''],
            isSuccess: [false],
            isLoading: [false],
          })
        );
      }
      this.cd.markForCheck();
    }
  }

  // Remove a file from the selected list
  removeFile(index: number): void {
    this.fileInputs.removeAt(index);
  }

  fileExtesionValidation(extension: string): boolean {
    const allowTypeExtenstion = this.allowFileExtension.find((c) =>
      c.extensions.split(',').some((ext) => ext.toLowerCase() === extension.toLowerCase())
    );
    return allowTypeExtenstion ? true : false;
  }

  private markFormGroupTouched(formGroup: UntypedFormGroup) {
    (<any>Object).values(formGroup.controls).forEach((control) => {
      control.markAsTouched();

      if (control.controls) {
        this.markFormGroupTouched(control);
      }
    });
  }

  saveFilesAndDocument() {
    if (this.userDepartment) {
      const categoryId = this.findDepartmentCategoryId(this.userDepartment);
      this.documentForm.patchValue({ categoryId: categoryId });
    }

    if (this.fileInputs.length === 0) {
      this.documentForm.get('files').markAsTouched();
      return;
    }

    this.loading = true;
    this.counter = 0;
    const concatObservable$ = [];
    
    this.fileInputs.controls.forEach((control) => {
      if (!control.get('isSuccess').value) {
        const documentObj = this.buildDocumentObject();
        documentObj.url = control.get('fileName').value;
        documentObj.name = control.get('name').value;
        documentObj.extension = control.get('extension').value;
        documentObj.fileData = control.get('file').value;

        // Set isAutoAssign flag based on sendMode
        const isAutoAssign = this.documentForm.get('sendMode').value === 'auto_assign';

        const formData = new FormData();
        formData.append('uploadFile', control.get('file').value);
        formData.append('name', documentObj.name);
        formData.append('description', documentObj.description || '');
        formData.append('categoryId', documentObj.categoryId);
        formData.append('location', documentObj.location);
        formData.append('clientId', documentObj.clientId || '');
        formData.append('statusId', documentObj.statusId || '');
        formData.append('auto_assign', isAutoAssign ? 'true' : 'false');

        // Add auto mode fields when in auto_assign mode
        if (isAutoAssign) {
          const isTimeBound = this.documentForm.get('autoIsTimeBound').value;
          formData.append('isTimeBound', isTimeBound ? 'true' : 'false');
          
          // Always set isTimeBound to true for AI mode to ensure dates are tracked
          formData.append('aiIsTimeBound', 'true');
          
          if (isTimeBound) {
            const startDate = this.documentForm.get('autoStartDate').value;
            const endDate = this.documentForm.get('autoEndDate').value;
            
            // Ensure dates are properly formatted and not empty
            if (startDate) {
              const formattedStartDate = this.formatDateForBackend(startDate);
              formData.append('startDate', formattedStartDate);
              formData.append('aiStartDate', formattedStartDate);
            }
            
            if (endDate) {
              const formattedEndDate = this.formatDateForBackend(endDate);
              formData.append('endDate', formattedEndDate);
              formData.append('aiEndDate', formattedEndDate);
            }
          }
          
          formData.append('isAllowDownload', this.documentForm.get('autoIsAllowDownload').value ? 'true' : 'false');
        } 
        // Add user permissions when in manual mode
        else {
          // Handle To users permissions
          const selectedToUsers = this.documentForm.get('selectedToUsers')?.value;
          if (selectedToUsers?.length > 0) {
            formData.append('toUsers', JSON.stringify(selectedToUsers.map(user => user.id)));
            
            const toUserTimeBound = this.toUserPermissionFormGroup.get('isTimeBound').value;
            formData.append('toUsersTimeBound', toUserTimeBound ? 'true' : 'false');
            
            if (toUserTimeBound) {
              const toStartDate = this.toUserPermissionFormGroup.get('startDate').value;
              const toEndDate = this.toUserPermissionFormGroup.get('endDate').value;
              
              if (toStartDate) {
                formData.append('toUsersStartDate', this.formatDateForBackend(toStartDate));
              }
              if (toEndDate) {
                formData.append('toUsersEndDate', this.formatDateForBackend(toEndDate));
              }
            }
            
            formData.append('toUsersAllowDownload', 
              this.toUserPermissionFormGroup.get('isAllowDownload').value ? 'true' : 'false');
          }

          // Handle regular users permissions
          const selectedUsers = this.documentForm.get('selectedUsers')?.value;
          if (selectedUsers?.length > 0) {
            formData.append('users', JSON.stringify(selectedUsers.map(user => user.id)));
            
            const userTimeBound = this.userPermissionFormGroup.get('isTimeBound').value;
            formData.append('usersTimeBound', userTimeBound ? 'true' : 'false');
            
            if (userTimeBound) {
              const userStartDate = this.userPermissionFormGroup.get('startDate').value;
              const userEndDate = this.userPermissionFormGroup.get('endDate').value;
              
              if (userStartDate) {
                formData.append('usersStartDate', this.formatDateForBackend(userStartDate));
              }
              if (userEndDate) {
                formData.append('usersEndDate', this.formatDateForBackend(userEndDate));
              }
            }
            
            formData.append('usersAllowDownload', 
              this.userPermissionFormGroup.get('isAllowDownload').value ? 'true' : 'false');
          }

          // Add document permissions array for backward compatibility
          if (documentObj.documentUserPermissions?.length > 0) {
            const permissions = documentObj.documentUserPermissions.map(permission => ({
              ...permission,
              startDate: permission.startDate ? this.formatDateForBackend(permission.startDate) : null,
              endDate: permission.endDate ? this.formatDateForBackend(permission.endDate) : null
            }));
            formData.append('documentUserPermissions', JSON.stringify(permissions));
          }
        }

        if (documentObj.documentMetaDatas?.length > 0) {
          formData.append('documentMetaDatas', JSON.stringify(documentObj.documentMetaDatas));
        }

        concatObservable$.push(
          this.documentService.saveDocument(formData).pipe(
            map((response: DocumentInfo | CommonError) => {
              if ('id' in response) {
                control.patchValue({
                  isSuccess: true,
                  message: this.translationService.getValue('DOCUMENT_SAVE_SUCCESSFULLY')
                });
                return response as DocumentInfo;
              } else {
                const errorResponse = response as CommonError;
                control.patchValue({
                  isSuccess: false,
                  message: errorResponse.friendlyMessage || errorResponse.messages?.[0] || 'Error saving document'
                });
                throw new Error(errorResponse.friendlyMessage || errorResponse.messages?.[0] || 'Error saving document');
              }
            }),
            catchError(error => {
              control.patchValue({
                isSuccess: false,
                message: error.message || 'Error saving document'
              });
              return of(null);
            })
          )
        );
      }
    });

    if (concatObservable$.length > 0) {
      this.sub$.sink = from(concatObservable$)
        .pipe(
          concatMap(observable => observable)
        )
        .subscribe({
          next: (response) => {
            this.counter++;
            if (this.counter === this.fileInputs.controls.length) {
              this.loading = false;
              this.fileInputs.clear();
              if (this.fileInput?.nativeElement) {
                this.fileInput.nativeElement.value = '';
              }
              const successMessage = this.documentForm.get('sendMode').value === 'auto_assign' 
                ? 'Document assigned successfully' 
                : 'Document sent successfully';
              this.toastr.success(successMessage);
              this.router.navigate(['/']);
              this.cd.detectChanges();
            }
          },
          error: (error) => {
            this.loading = false;
            this.cd.detectChanges();
          }
        });
    } else {
      this.loading = false;
      this.cd.detectChanges();
    }
  }

  addDocumentTrail(id: string) {
    const objDocumentAuditTrail: DocumentAuditTrail = {
      documentId: id,
      operationName: DocumentOperation.Created.toString(),
    };
    this.sub$.sink = this.commonService
      .addDocumentAuditTrail(objDocumentAuditTrail)
      .subscribe((c) => {
        this.loading = false;
      });
  }

  buildDocumentObject(): DocumentInfo {
    const documentMetaTags = this.documentMetaTagsArray.getRawValue();
    const document: DocumentInfo = {
      categoryId: this.findDepartmentCategoryId(this.userDepartment),
      description: this.documentForm.get('description')?.value ?? '',
      documentMetaDatas: [...documentMetaTags],
      location: this.documentForm.get('location')?.value ?? '',
      clientId: this.documentForm.get('clientId')?.value ?? '',
      statusId: this.documentForm.get('statusId')?.value ?? '',
    };

    // For manual mode, handle user permissions
    const selectedToUsers: User[] = this.documentForm.get('selectedToUsers')?.value ?? [];
    
    if (selectedToUsers?.length > 0) {
      document.documentUserPermissions = selectedToUsers.map((user) => {
        const permissions = Object.assign(
          {},
          {
            id: '',
            documentId: '',
            userId: user.id,
          },
          this.toUserPermissionFormGroup.value
        );
        return permissions;
      });
    }

    const selectedUsers: User[] = this.documentForm.get('selectedUsers')?.value ?? [];
    
    if (selectedUsers?.length > 0) {
      document.documentUserPermissions = [
        ...(document.documentUserPermissions || []),
        ...selectedUsers.map((user) => {
          return Object.assign(
            {},
            {
              id: '',
              documentId: '',
              userId: user.id,
            },
            this.userPermissionFormGroup.value
          );
        })
      ];
    }
    
    return document;
  }

  findDepartmentCategoryId(departmentName: string): string {
    const matchingCategory = this.categoryStore.categories()?.find(cat => 
      cat.name.toLowerCase() === departmentName?.toLowerCase()
    );
    return matchingCategory?.id ?? '';
  }

  toUserTimeBoundChange(event: MatCheckboxChange) {
    if (event.checked) {
      this.toUserPermissionFormGroup
        .get('startDate')
        .setValidators([Validators.required]);
      this.toUserPermissionFormGroup
        .get('endDate')
        .setValidators([Validators.required]);
    } else {
      this.toUserPermissionFormGroup.get('startDate').clearValidators();
      this.toUserPermissionFormGroup.get('startDate').updateValueAndValidity();
      this.toUserPermissionFormGroup.get('endDate').clearValidators();
      this.toUserPermissionFormGroup.get('endDate').updateValueAndValidity();
    }
  }

  userTimeBoundChange(event: MatCheckboxChange) {
    if (event.checked) {
      this.userPermissionFormGroup
        .get('startDate')
        .setValidators([Validators.required]);
      this.userPermissionFormGroup
        .get('endDate')
        .setValidators([Validators.required]);
    } else {
      this.userPermissionFormGroup.get('startDate').clearValidators();
      this.userPermissionFormGroup.get('startDate').updateValueAndValidity();
      this.userPermissionFormGroup.get('endDate').clearValidators();
      this.userPermissionFormGroup.get('endDate').updateValueAndValidity();
    }
  }

  autoTimeBoundChange(event: MatCheckboxChange) {
    if (event.checked) {
      // Set validators but don't set values, allowing placeholders to show
      this.documentForm.get('autoStartDate').setValidators([Validators.required]);
      this.documentForm.get('autoEndDate').setValidators([Validators.required]);
      
      // Make sure the values are empty to show placeholders
      this.documentForm.get('autoStartDate').setValue('');
      this.documentForm.get('autoEndDate').setValue('');
      
      // Force update the validation state
      this.documentForm.get('autoStartDate').updateValueAndValidity();
      this.documentForm.get('autoEndDate').updateValueAndValidity();
      
      // Force Angular change detection
      this.cd.detectChanges();
    } else {
      // Clear date values when checkbox is unchecked
      this.documentForm.get('autoStartDate').setValue('');
      this.documentForm.get('autoEndDate').setValue('');
      
      this.documentForm.get('autoStartDate').clearValidators();
      this.documentForm.get('autoStartDate').updateValueAndValidity();
      this.documentForm.get('autoEndDate').clearValidators();
      this.documentForm.get('autoEndDate').updateValueAndValidity();
    }
  }

  autoSendDocuments() {
    if (this.fileInputs.length === 0) {
      this.documentForm.get('files').markAsTouched();
      return;
    }

    this.loading = true;
    
    // Create FormData to send to the endpoint
    const formData = new FormData();
    
    // Add the department ID
    if (this.userDepartment) {
      const categoryId = this.findDepartmentCategoryId(this.userDepartment);
      formData.append('categoryId', categoryId);
    }

    // Add all files
    this.fileInputs.controls.forEach((control, index) => {
      const file = control.get('file').value;
      formData.append(`files[${index}]`, file);
      formData.append(`names[${index}]`, control.get('name').value);
    });

    // TODO: Replace with your endpoint call
    console.log('Ready to send to AI endpoint:', formData);
    
    // For now, just clear the form and show a message
    this.resultArray.push({
      isSuccess: true,
      name: 'AI Processing',
      message: 'Documents ready for AI processing (endpoint to be implemented)'
    });
    
    this.loading = false;
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
    while (this.fileInputs.controls.length) {
      this.fileInputs.removeAt(0);
    }
  }

  private formatDateForBackend(date: any): string {
    if (!date) {
      return '';
    }
    
    try {
      // Handle both Date objects and date strings
      const dateObj = date instanceof Date ? date : new Date(date);
      
      // Check if valid date
      if (isNaN(dateObj.getTime())) {
        console.error('Invalid date:', date);
        return '';
      }
      
      // Format date as ISO string
      return dateObj.toISOString();
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  }

  // Add a new method to initialize date fields
  initializeDateFields(): void {
    // Check after a short delay to ensure form is fully initialized
    setTimeout(() => {
      // Clear any auto-populated date values to ensure placeholders show
      if (this.documentForm.get('autoIsTimeBound').value) {
        // Only set validators, don't set default values
        this.documentForm.get('autoStartDate').setValidators([Validators.required]);
        this.documentForm.get('autoEndDate').setValidators([Validators.required]);
      } else {
        // Make sure date fields are empty
        this.documentForm.get('autoStartDate').setValue('');
        this.documentForm.get('autoEndDate').setValue('');
      }
    }, 0);
  }

  // Add a method to reset date fields
  resetDateFields(): void {
    // Explicitly reset date fields to ensure placeholders show
    this.documentForm.get('autoStartDate').setValue('');
    this.documentForm.get('autoEndDate').setValue('');
    
    // Force Angular change detection
    this.cd.detectChanges();
  }

  onAutoEndDateChange(event: any): void {
    if (event && event.value) {
      const endDate = event.value;
      this.documentForm.patchValue({
        autoEndDate: endDate
      });
      this.documentForm.markAsDirty();
      this.cd.detectChanges();
    }
  }
}
