import { Direction } from '@angular/cdk/bidi';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  AfterViewInit,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import {
  UntypedFormGroup,
  FormArray,
  UntypedFormBuilder,
  Validators,
  FormGroup,
  UntypedFormControl,
} from '@angular/forms';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { AllowFileExtension } from '@core/domain-classes/allow-file-extension';
import { Category } from '@core/domain-classes/category';
import { DocumentInfo } from '@core/domain-classes/document-info';
import { DocumentMetaData } from '@core/domain-classes/documentMetaData';
import { FileInfo } from '@core/domain-classes/file-info';
import { Role } from '@core/domain-classes/role';
import { User } from '@core/domain-classes/user';
import { SecurityService } from '@core/security/security.service';
import { CategoryService } from '@core/services/category.service';
import { CommonService } from '@core/services/common.service';
import { TranslationService } from '@core/services/translation.service';
import { BaseComponent } from 'src/app/base.component';
import { ClientStore } from 'src/app/client/client-store';
import { OpenAIService } from '@core/services/openai.service';
import { UserStore } from 'src/app/user/store/user-store';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { DocumentOperation } from '@core/domain-classes/document-operation';
import { DocumentAuditTrail } from '@core/domain-classes/document-audit-trail';
import { DocumentService } from '../document.service';
import { catchError, concatMap, from, of } from 'rxjs';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

// Declare Quill as global variable
declare var Quill: any;

interface Signature {
  id: number;  // Changed from string to number to match backend
  name: string;
  url: string;
  signatureData?: string;  // Add optional signature_data property
  createdAt?: string;
  updatedAt?: string;
}

@Component({
  selector: 'app-document-manage-presentation',
  templateUrl: './document-manage-presentation.component.html',
  styleUrls: ['./document-manage-presentation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentManagePresentationComponent
  extends BaseComponent
  implements OnInit, AfterViewInit {
  document: DocumentInfo;
  documentForm: UntypedFormGroup;
  extension = '';
  categories: Category[] = [];
  allCategories: Category[] = [];
  documentSource: string;
  userDepartment: string = '';
  // eslint-disable-next-line @angular-eslint/no-output-on-prefix
  @Output() onSaveDocument: EventEmitter<DocumentInfo> =
    new EventEmitter<DocumentInfo>();
  progress = 0;
  message = '';
  fileInfo: FileInfo;
  isFileUpload = false;
  fileData: any;
  roles: Role[];
  allowFileExtension: AllowFileExtension[] = [];
  minDate: Date;
  isS3Supported = false;
  direction: Direction;
  clientStore = inject(ClientStore);
  userStore = inject(UserStore);
  resultArray: any = [];
  loading: boolean = false;
  counter: number = 0;
  signatureImageUrl: string | null = null;

  get documentMetaTagsArray(): FormArray {
    return <FormArray>this.documentForm.get('documentMetaTags');
  }
  
  get fileInputs(): FormArray {
    return (<FormArray>this.documentForm.get('files')) as FormArray;
  }

  public showAiPrompt = false;
  public aiPrompt = '';
  public isGenerating = false;
  public showModal = false;
  public errorMessage = '';

  // Replace CKEditor with Quill
  private quillEditor: any;

  showSignatureModal = false;
  savedSignatures: Signature[] = [];
  newSignatureName = '';
  newSignatureFile: File | null = null;
  selectedSignature: Signature | null = null;
  tempSignatureUrl: string = '';

  constructor(
    private fb: UntypedFormBuilder,
    private httpClient: HttpClient,
    private cd: ChangeDetectorRef,
    private categoryService: CategoryService,
    private commonService: CommonService,
    private securityService: SecurityService,
    private translationService: TranslationService,
    private openAIService: OpenAIService,
    private documentService: DocumentService,
    private router: Router,
    private toastr: ToastrService
  ) {
    super();
    this.minDate = new Date();
    this.loadSavedSignatures();
  }

  // Add missing methods
  openSignatureManager(): void {
    this.showSignatureModal = true;
  }

  closeSignatureModal(): void {
    this.showSignatureModal = false;
    this.newSignatureName = '';
    this.newSignatureFile = null;
    this.tempSignatureUrl = '';
  }

  ngOnInit(): void {
    this.createDocumentForm();
    this.getCategories();
    this.documentMetaTagsArray.push(this.buildDocumentMetaTag());
    this.loadUserData();
    this.getRoles();
    this.getCompanyProfile();
    this.getLangDir();
    this.getAllAllowFileExtension();
  }

  ngAfterViewInit(): void {
    // Initialize Quill after view init
    setTimeout(() => {
      this.initQuillEditor();
    }, 0);
  }

  getLangDir() {
    this.sub$.sink = this.translationService.lanDir$.subscribe(
      (c: Direction) => (this.direction = c)
    );
  }

  getCompanyProfile() {
    this.securityService.companyProfile.subscribe((profile) => {
      if (profile) {
        this.isS3Supported = profile.location == 's3';
      }
    });
  }

  getRoles() {
    this.sub$.sink = this.commonService
      .getRolesForDropdown()
      .subscribe((roles: Role[]) => (this.roles = roles));
  }

  getCategories() {
    this.categoryService.getAllCategoriesForDropDown().subscribe((c) => {
      this.categories = c;
      this.setDeafLevel();
    });
  }

  getAllAllowFileExtension() {
    this.commonService.allowFileExtension$.subscribe(
      (allowFileExtension: AllowFileExtension[]) => {
        if (allowFileExtension) {
          this.allowFileExtension = allowFileExtension;
        }
      }
    );
  }

  setDeafLevel(parent?: Category, parentId?: string) {
    const children = this.categories.filter((c) => c.parentId == parentId);
    if (children.length > 0) {
      children.map((c, index) => {
        c.deafLevel = parent ? parent.deafLevel + 1 : 0;
        c.index =
          (parent ? parent.index : 0) + index * Math.pow(0.1, c.deafLevel);
        this.allCategories.push(c);
        this.setDeafLevel(c, c.id);
      });
    }
    return parent;
  }

  onDocumentChange($event: any) {
    const files = $event.target.files || $event.srcElement.files;
    const file_url = files[0];
    this.extension = file_url.name.split('.').pop();
    if (this.fileExtesionValidation(this.extension)) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.documentSource = e.target.result;
        this.fileUploadValidation('upload');
      };
      reader.readAsDataURL(file_url);
    } else {
      this.documentSource = null;
      this.fileUploadValidation('');
    }
  }

  fileUploadValidation(fileName: string) {
    this.documentForm.patchValue({
      url: fileName,
    });
    this.documentForm.get('url').markAsTouched();
    this.documentForm.updateValueAndValidity();
  }

  fileUploadExtensionValidation(extension: string) {
    this.documentForm.patchValue({
      extension: extension,
    });
    this.documentForm.get('extension').markAsTouched();
    this.documentForm.updateValueAndValidity();
  }

  fileExtesionValidation(extension: string): boolean {
    const allowTypeExtenstion = this.allowFileExtension.find((c) =>
      c.extensions.toLowerCase().includes(extension.toLowerCase())
    );
    return allowTypeExtenstion ? true : false;
  }

  createDocumentForm() {
    this.documentForm = this.fb.group({
      name: ['', [Validators.required]],
      description: [''],
      categoryId: [''],
      url: [''],
      extension: [''],
      documentMetaTags: this.fb.array([]),
      location: [''],
      clientId: [''],
      selectedRoles: [],
      selectedToUsers: [],
      selectedThroughUsers: [],
      files: this.fb.array([]),
      templateType: ['template1'],
      subject: ['', [Validators.required]],
      content: ['', [Validators.required]],
      signaturePosition: ['right'],
      rolePermissionForm: this.fb.group({
        isTimeBound: new UntypedFormControl(false),
        startDate: [''],
        endDate: [''],
        isAllowDownload: new UntypedFormControl(false),
      }),
      toUserPermissionForm: this.fb.group({
        isTimeBound: new UntypedFormControl(false),
        startDate: [''],
        endDate: [''],
        isAllowDownload: new UntypedFormControl(false),
      }),
      throughUserPermissionForm: this.fb.group({
        isTimeBound: new UntypedFormControl(false),
        startDate: [''],
        endDate: [''],
        isAllowDownload: new UntypedFormControl(false),
      }),
      selectedSignature: [''],
    });
    this.companyProfileSubscription();

    // Subscribe to content changes for preview with change detection
    this.documentForm.get('content').valueChanges.subscribe(value => {
      // Trigger change detection to update preview
      this.cd.markForCheck();
    });
    
    // Subscribe to subject changes for preview
    this.documentForm.get('subject').valueChanges.subscribe(value => {
      // Trigger change detection to update preview
      this.cd.markForCheck();
    });
  }

  companyProfileSubscription() {
    this.securityService.companyProfile.subscribe((profile) => {
      if (profile) {
        this.documentForm.get('location').setValue(profile.location ?? 'local');
      }
    });
  }

  buildDocumentMetaTag(): FormGroup {
    return this.fb.group({
      id: [''],
      documentId: [''],
      metatag: [''],
    });
  }

  get rolePermissionFormGroup() {
    return this.documentForm.get('rolePermissionForm') as FormGroup;
  }

  get toUserPermissionFormGroup() {
    return this.documentForm.get('toUserPermissionForm') as UntypedFormGroup;
  }

  get throughUserPermissionFormGroup() {
    return this.documentForm.get('throughUserPermissionForm') as UntypedFormGroup;
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

  SaveDocument() {
    if (this.documentForm.get('subject').invalid || this.documentForm.get('content').invalid) {
      this.documentForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.counter = 0;
    this.resultArray = [];

    // Create array of file tasks
    const fileUploadTasks = [];
    
    // Add the PDF document export
    const pdfTask = this.exportToPDF(true)
      .then(pdfBlob => {
        const pdfFile = new File([pdfBlob], 
          `${this.documentForm.get('subject').value.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`, 
          { type: 'application/pdf' }
        );
        return pdfFile;
      })
      .catch(error => {
        console.error('Error creating PDF', error);
        return null;
      });

    Promise.all([pdfTask])
      .then(files => {
        // Filter out any null results
        const validFiles = files.filter(file => file !== null);
        
        // If we have a valid PDF file
        if (validFiles.length > 0) {
          // Add PDF file to the document objects
          validFiles.forEach(file => {
            this.fileInputs.push(
              this.fb.group({
                fileName: [file.name],
                file: [file],
                name: [file.name, Validators.required],
                extension: ['pdf'],
                message: [''],
                isSuccess: [false],
                isLoading: [false],
              })
            );
          });
        }
        
        // If there's also an uploaded document, add it
        if (this.fileData) {
          this.fileInputs.push(
            this.fb.group({
              fileName: [this.fileData.name],
              file: [this.fileData],
              name: [this.fileData.name, Validators.required],
              extension: [this.extension],
              message: [''],
              isSuccess: [false],
              isLoading: [false],
            })
          );
        }
        
        // If we have files to process, save them
        if (this.fileInputs.length > 0) {
          this.processSaveDocuments();
        } else {
          this.loading = false;
          this.resultArray.push({
            isSuccess: false,
            name: 'No files to process',
            message: 'No valid files were generated or uploaded'
          });
        }
      });
  }

  processSaveDocuments(): void {
    const concatObservable$ = [];
    this.fileInputs.controls.forEach((control) => {
      const documentObj = this.buildDocumentObject();
      documentObj.url = control.get('fileName').value;
      documentObj.name = control.get('name').value;
      documentObj.extension = control.get('extension').value;
      documentObj.fileData = control.get('file').value;
      
      // Set categoryId to user department
      documentObj.categoryId = this.findDepartmentCategoryId(this.userDepartment);
      
      concatObservable$.push(this.documentService.addDocument({ ...documentObj }));
    });

    from(concatObservable$)
      .pipe(
        concatMap((obs, index) => {
          this.fileInputs.at(index).patchValue({
            isLoading: true
          });
          return obs.pipe(
            catchError(err => {
              return of(`${typeof (err.messages?.[0]) === 'string' ? err.messages[0] : (err.friendlyMessage || 'Error saving document')}`);
            })
          );
        })
      )
      .subscribe({
        next: (document: DocumentInfo | string) => {
          this.counter++;
          this.fileInputs.at(this.counter - 1).patchValue({
            isLoading: false
          });
          if (typeof document === 'string') {
            this.resultArray.push({
              isSuccess: false,
              message: document,
              name: this.fileInputs.at(this.counter - 1).get('name').value
            });
          } else {
            this.addDocumentTrail(document.id);
            this.resultArray.push({
              isSuccess: true,
              name: this.fileInputs.at(this.counter - 1).get('name').value,
              message: this.translationService.getValue('DOCUMENT_SAVE_SUCCESSFULLY')
            });
          }
          
          if (this.counter === this.fileInputs.length) {
            this.loading = false;
            this.cd.markForCheck();
            
            // Add success toast message
            this.toastr.success('Memo sent successfully');
            
            // Navigate to documents page after saving is complete
            this.router.navigate(['/']);
          }
        },
        complete: () => {
          this.loading = false;
          this.cd.markForCheck();
          
          // Ensure navigation happens on completion as well
          if (this.fileInputs.length > 0) {
            this.router.navigate(['/']);
          }
        }
      });
  }

  findDepartmentCategoryId(departmentName: string): string {
    // Find matching category by name
    const matchingCategory = this.allCategories.find(cat => 
      cat.name.toLowerCase() === departmentName.toLowerCase()
    );
    return matchingCategory ? matchingCategory.id : '';
  }

  addDocumentTrail(id: string) {
    const objDocumentAuditTrail: DocumentAuditTrail = {
      documentId: id,
      operationName: DocumentOperation.Created.toString(),
    };
    this.sub$.sink = this.commonService
      .addDocumentAuditTrail(objDocumentAuditTrail)
      .subscribe(() => {});
  }

  removeFile(index: number): void {
    this.fileInputs.removeAt(index);
  }

  buildDocumentObject(): DocumentInfo {
    const documentMetaTags = this.documentMetaTagsArray.getRawValue();
    const document: DocumentInfo = {
      categoryId: this.documentForm.get('categoryId').value || this.findDepartmentCategoryId(this.userDepartment),
      description: this.documentForm.get('description').value,
      name: this.documentForm.get('name').value,
      documentMetaDatas: [...documentMetaTags],
      location: this.documentForm.get('location').value,
      clientId: this.documentForm.get('clientId').value ?? '',
      templateType: this.documentForm.get('templateType').value,
      subject: this.documentForm.get('subject').value,
      content: this.documentForm.get('content').value,
      toUserEndDate: this.toUserPermissionFormGroup.get('endDate').value,
      signatureUrl: this.signatureImageUrl,
      signaturePosition: this.documentForm.get('signaturePosition').value
    };
    
    const selectedRoles: Role[] =
      this.documentForm.get('selectedRoles').value ?? [];
    if (selectedRoles?.length > 0) {
      document.documentRolePermissions = selectedRoles.map((role) => {
        return Object.assign(
          {},
          {
            id: '',
            documentId: '',
            roleId: role.id,
          },
          this.rolePermissionFormGroup.value
        );
      });
    }

    // Initialize document user permissions array
    document.documentUserPermissions = [];

    // Get Through users
    const selectedThroughUsers: User[] =
      this.documentForm.get('selectedThroughUsers').value ?? [];

    // Get To users
    const selectedToUsers: User[] =
      this.documentForm.get('selectedToUsers').value ?? [];

    // If Through users exist, only add them to permissions
    if (selectedThroughUsers?.length > 0) {
      document.documentUserPermissions = selectedThroughUsers.map((user) => {
        return Object.assign(
          {},
          {
            id: '',
            documentId: '',
            userId: user.id,
          },
          this.throughUserPermissionFormGroup.value
        );
      });
    } 
    // Only if no Through users are selected, add To users
    else if (selectedToUsers?.length > 0) {
      document.documentUserPermissions = selectedToUsers.map((user) => {
        return Object.assign(
          {},
          {
            id: '',
            documentId: '',
            userId: user.id,
          },
          this.toUserPermissionFormGroup.value
        );
      });
    }

    return document;
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

  upload(files) {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    this.extension = file.name.split('.').pop();
    
    if (!this.fileExtesionValidation(this.extension)) {
      this.fileUploadExtensionValidation('');
      this.cd.markForCheck();
      return;
    } else {
      this.fileUploadExtensionValidation('valid');
    }

    this.fileData = file;
    this.documentForm.get('url').setValue(file.name);
    if (!this.documentForm.get('name').value) {
      this.documentForm.get('name').setValue(file.name);
    }
  }

  roleTimeBoundChange(event: MatCheckboxChange) {
    if (event.checked) {
      this.rolePermissionFormGroup
        .get('startDate')
        .setValidators([Validators.required]);
      this.rolePermissionFormGroup
        .get('endDate')
        .setValidators([Validators.required]);
    } else {
      this.rolePermissionFormGroup.get('startDate').clearValidators();
      this.rolePermissionFormGroup.get('startDate').updateValueAndValidity();
      this.rolePermissionFormGroup.get('endDate').clearValidators();
      this.rolePermissionFormGroup.get('endDate').updateValueAndValidity();
    }
  }

  toUserTimeBoundChange(event: MatCheckboxChange) {
    if (event.checked) {
      this.toUserPermissionFormGroup.get('startDate').setValidators([Validators.required]);
      this.toUserPermissionFormGroup.get('endDate').setValidators([Validators.required]);
    } else {
      this.toUserPermissionFormGroup.get('startDate').clearValidators();
      this.toUserPermissionFormGroup.get('endDate').clearValidators();
      this.toUserPermissionFormGroup.get('startDate').setValue(null);
      this.toUserPermissionFormGroup.get('endDate').setValue(null);
    }
    this.toUserPermissionFormGroup.get('startDate').updateValueAndValidity();
    this.toUserPermissionFormGroup.get('endDate').updateValueAndValidity();
  }

  throughUserTimeBoundChange(event: MatCheckboxChange) {
    if (event.checked) {
      this.throughUserPermissionFormGroup.get('startDate').setValidators([Validators.required]);
      this.throughUserPermissionFormGroup.get('endDate').setValidators([Validators.required]);
    } else {
      this.throughUserPermissionFormGroup.get('startDate').clearValidators();
      this.throughUserPermissionFormGroup.get('endDate').clearValidators();
      this.throughUserPermissionFormGroup.get('startDate').setValue(null);
      this.throughUserPermissionFormGroup.get('endDate').setValue(null);
    }
    this.throughUserPermissionFormGroup.get('startDate').updateValueAndValidity();
    this.throughUserPermissionFormGroup.get('endDate').updateValueAndValidity();
  }

  getCategoryName(categoryId: string): string {
    const category = this.allCategories.find(cat => cat.id === categoryId);
    return category ? category.name : '';
  }

  getSelectedRolesString(): string {
    const selectedRoles = this.documentForm.get('selectedRoles').value;
    if (!selectedRoles || selectedRoles.length === 0) return '';
    return selectedRoles.map(role => role.name).join(', ');
  }
  
  getSelectedToUsersString(): string {
    // Get selected To users with the new format - show only firstname lastname
    const selectedToUsers = this.documentForm?.get('selectedToUsers')?.value || [];
    const toUsersString = selectedToUsers.length > 0 ? 
      selectedToUsers.map(user => `${user.firstName || user.firstname} ${user.lastName || user.lastname}`).join(', ') : '';
    
    // Get selected roles
    const selectedRoles = this.documentForm?.get('selectedRoles')?.value || [];
    const rolesString = selectedRoles.length > 0 ?
      selectedRoles.map(role => role.name).join(', ') : '';
    
    // Combine both strings with a comma if both have values
    if (toUsersString && rolesString) {
      return `${toUsersString}, ${rolesString}`;
    } else {
      return toUsersString || rolesString || '';
    }
  }
  
  getSelectedThroughUsers(): User[] {
    return this.documentForm?.get('selectedThroughUsers')?.value || [];
  }
  
  getSelectedThroughUsersString(): string {
    // For Through users - show only positionName
    const selectedThroughUsers = this.documentForm?.get('selectedThroughUsers')?.value;
    if (!selectedThroughUsers || selectedThroughUsers.length === 0) {
      return '';
    }
    return selectedThroughUsers.map(user => {
      // Type assertion to access dynamic properties
      const userObj = user as any;
      return userObj.positionName || userObj.position || userObj.displayName || 
             `${userObj.firstName || userObj.firstname} ${userObj.lastName || userObj.lastname}`;
    }).join(', ');
  }

  getCurrentUser(): string {
    const authObj = JSON.parse(localStorage.getItem('authObj'));
    if (authObj && authObj.user) {
      return `${authObj.user.firstName || ''} ${authObj.user.lastName || ''}`;
    }
    return '';
  }

  getCurrentDate(): Date {
    return new Date();
  }

  onEditorChange(event: any): void {
    this.documentForm.get('content').setValue(event);
    this.cd.markForCheck();
  }

  openAiModal(): void {
    this.showModal = true;
    this.aiPrompt = '';
    this.errorMessage = '';
    
    // Focus the textarea after a brief delay to ensure modal is rendered
    setTimeout(() => {
      const promptTextarea = document.getElementById('aiPromptInput') as HTMLTextAreaElement;
      if (promptTextarea) {
        promptTextarea.focus();
      }
    }, 500);
  }

  closeAiModal(): void {
    this.showModal = false;
    this.errorMessage = '';
  }

  generateContent(): void {
    if (!this.aiPrompt.trim() || this.isGenerating) return;

    this.isGenerating = true;
    this.errorMessage = '';

    this.openAIService.generateContent(this.aiPrompt).subscribe({
      next: (response) => {
        if (response && response.content) {
          // Get the current content
          const currentContent = this.documentForm.get('content').value || '';
          // Append the new content
          const newContent = currentContent + (currentContent ? '\n\n' : '') + response.content;
          // Update the form control
          this.documentForm.patchValue({
            content: newContent
          });
          
          // Update Quill editor content
          if (this.quillEditor) {
            this.quillEditor.clipboard.dangerouslyPasteHTML(newContent);
          }
          
          this.isGenerating = false;
          this.closeAiModal();
        } else {
          this.errorMessage = 'Invalid response from AI service';
          this.isGenerating = false;
        }
        this.cd.detectChanges();
      },
      error: (error) => {
        console.error('Error generating content:', error);
        this.errorMessage = error.message || 'Error connecting to AI service. Please try again.';
        this.isGenerating = false;
        this.cd.detectChanges();
      }
    });
  }

  // Initialize Quill editor
  initQuillEditor(): void {
    const editorElement = document.getElementById('quill-editor');
    if (editorElement) {
      this.quillEditor = new Quill('#quill-editor', {
        theme: 'snow',
        modules: {
          toolbar: [
            ['bold', 'italic', 'underline', 'strike'],
            ['blockquote', 'code-block'],
            [{ 'header': 1 }, { 'header': 2 }],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            [{ 'indent': '-1'}, { 'indent': '+1' }],
            [{ 'direction': 'rtl' }],
            [{ 'size': ['small', false, 'large', 'huge'] }],
            [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
            [{ 'color': [] }, { 'background': [] }],
            [{ 'font': [] }],
            [{ 'align': [] }],
            ['clean'],
            ['link', 'image']
          ]
        },
        placeholder: 'Type the content here...'
      });
      
      // Set initial content if any
      const initialContent = this.documentForm.get('content').value;
      if (initialContent) {
        this.quillEditor.clipboard.dangerouslyPasteHTML(initialContent);
      }
      
      // Setup content change handler
      this.quillEditor.on('text-change', () => {
        const content = this.quillEditor.root.innerHTML;
        this.documentForm.get('content').setValue(content);
        this.cd.detectChanges();
      });
    }
  }

  exportToPDF(returnBlob: boolean = false): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
    const previewElement = document.querySelector('.preview-box');
    if (!previewElement) {
      console.error('Preview element not found');
        resolve(null);
      return;
    }

      // Force black color on ALL elements before capture 
      const applyBlackTextRecursively = (element: Element) => {
        if (element instanceof HTMLElement) {
          element.style.setProperty('color', '#000000', 'important');
          element.style.setProperty('font-weight', 'normal', 'important');
          element.style.setProperty('font-size', '10px', 'important');
        }
        
        // Process all child elements
        if (element.children) {
          Array.from(element.children).forEach(child => {
            applyBlackTextRecursively(child);
          });
        }
      };
      
      // Apply black text color to the entire preview box and all its children
      applyBlackTextRecursively(previewElement);
      
      // Additional specific targeting for headers and titles
      const headers = previewElement.querySelectorAll('h1, h2, h3, h4, h5, h6, .letterhead-header, .memorandum-header, .official-letterhead h4');
      headers.forEach(header => {
        const headerElement = header as HTMLElement;
        headerElement.style.setProperty('color', '#000000', 'important');
      });

      // Specifically target the contact details section for smaller font
      const contactDetails = previewElement.querySelector('.letterhead-contact-details');
      if (contactDetails instanceof HTMLElement) {
        contactDetails.style.setProperty('font-size', '8px', 'important');
        contactDetails.style.setProperty('margin-left', '-25px', 'important');
        const paragraphs = contactDetails.querySelectorAll('p');
        paragraphs.forEach(p => {
          if (p instanceof HTMLElement) {
            p.style.setProperty('font-size', '8px', 'important');
            p.style.setProperty('line-height', '1.2', 'important');
          }
        });
      }

      // Ensure the memo-details section has grey background for template 1
      if (this.documentForm.get('templateType').value === 'template1') {
        const memoDetails = previewElement.querySelector('.memo-details');
        if (memoDetails && memoDetails instanceof HTMLElement) {
          memoDetails.style.setProperty('background-color', '#f5f5f5', 'important');
        }
    }

    html2canvas(previewElement as HTMLElement, {
      scale: 4,
      useCORS: true,
      logging: false,
      allowTaint: true,
      backgroundColor: '#ffffff',
      onclone: (clonedDoc) => {
          // Create a global style to force black text everywhere
          const globalStyle = clonedDoc.createElement('style');
          globalStyle.textContent = `
            * {
              color: #000000 !important;
            }
            h1, h2, h3, h4, h5, h6 {
              color: #000000 !important;
            }
            .letterhead-header, .memorandum-header, .official-letterhead h4, 
            .preview-box p, .preview-box div, .preview-box span {
              color: #000000 !important;
            }
            .memo-details {
              background-color: #f5f5f5 !important;
            }
            .letterhead-contact-details, .letterhead-contact-details p {
              font-size: 8px !important;
              line-height: 1.2 !important;
              margin-left: 60px !important;
            }
          `;
          clonedDoc.head.appendChild(globalStyle);
          
          // Apply black color to all elements in the cloned document
          const clonedPreview = clonedDoc.querySelector('.preview-box');
          if (clonedPreview) {
            // Process all elements recursively
            function forceBlackColorRecursively(element: Element): void {
              if (element instanceof HTMLElement) {
                element.style.setProperty('color', '#000000', 'important');
                element.style.setProperty('font-weight', 'normal', 'important');
                element.style.setProperty('font-size', '10px', 'important');
              }
              
              if (element.children) {
                Array.from(element.children).forEach(child => {
                  forceBlackColorRecursively(child);
                });
              }
            }
            
            forceBlackColorRecursively(clonedPreview);
            
            // Additional specific targeting for headers and titles in the cloned document
            const clonedHeaders = clonedPreview.querySelectorAll('h1, h2, h3, h4, h5, h6, .letterhead-header, .memorandum-header, .official-letterhead h4');
            clonedHeaders.forEach(header => {
              const headerElement = header as HTMLElement;
              headerElement.style.setProperty('color', '#000000', 'important');
            });

            // Target contact details in cloned document
            const clonedContactDetails = clonedPreview.querySelector('.letterhead-contact-details');
            if (clonedContactDetails instanceof HTMLElement) {
              clonedContactDetails.style.setProperty('font-size', '8px', 'important');
              clonedContactDetails.style.setProperty('margin-left', '-25px', 'important');
              const clonedParagraphs = clonedContactDetails.querySelectorAll('p');
              clonedParagraphs.forEach(p => {
                if (p instanceof HTMLElement) {
                  p.style.setProperty('font-size', '8px', 'important');
                  p.style.setProperty('line-height', '1.2', 'important');
                }
              });
            }
            
            // Ensure the memo-details section has grey background in the cloned document
            if (this.documentForm.get('templateType').value === 'template1') {
              const clonedMemoDetails = clonedPreview.querySelector('.memo-details');
              if (clonedMemoDetails && clonedMemoDetails instanceof HTMLElement) {
                clonedMemoDetails.style.setProperty('background-color', '#f5f5f5', 'important');
              }
            }
          }
        }
      }).then(canvas => {
        // Set canvas context to use black fill
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#000000';
        }
        
      const imgWidth = 210;
      const imgHeight = canvas.height * imgWidth / canvas.width;
      const contentDataURL = canvas.toDataURL('image/png', 1.0);
      
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: false
      });
      
      pdf.addImage(contentDataURL, 'PNG', 0, 0, imgWidth, imgHeight, '', 'FAST');
      
        if (returnBlob) {
          // Return PDF as a Blob for saving as a document
          const blob = pdf.output('blob');
          resolve(blob);
        } else {
          // Save PDF directly
      const pdfName = this.documentForm.get('templateType').value === 'template1' 
        ? 'NIPSS_Memorandum.pdf' 
        : 'NIPSS_Letter.pdf';
      pdf.save(pdfName);
          resolve(null);
        }
      }).catch(error => {
        console.error('Error in HTML2Canvas', error);
        reject(error);
      });
    });
  }

  loadUserData(): void {
    // Load user data from UserStore for the dropdowns
    this.userStore.loadUsers();
    this.userStore.loadUserPositions();
    
    // Make a separate call to get the user's department and position as simple strings
    this.sub$.sink = this.httpClient.get<{dept: string, pst: string}>('api/user-position').subscribe({
      next: (response) => {
        console.log('User department/position from api/user-position:', response);
        // Set department as a simple string
        this.userDepartment = response.dept;
        this.cd.detectChanges();
      },
      error: (error) => {
        console.error('Error fetching user department:', error);
      }
    });
  }

  uploadSignature(event: any) {
    const file = event.target.files[0];
    if (file) {
      // Check if file is an image
      if (!file.type.startsWith('image/')) {
        this.toastr.error('Please upload an image file');
        return;
      }

      // Check file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        this.toastr.error('Signature image must be less than 2MB');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.signatureImageUrl = e.target.result;
        this.cd.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  // Load signatures from API
  loadSavedSignatures(): void {
    this.httpClient.get<Signature[]>('api/get-media-libary').subscribe({
      next: (signatures) => {
        console.log('Loaded signatures:', signatures);
        if (signatures && signatures.length > 0) {
          console.log('First signature URL:', signatures[0].url);
          console.log('First signature data available:', !!signatures[0].signatureData);
        }
        this.savedSignatures = signatures;
        this.cd.markForCheck();
      },
      error: (error) => {
        console.error('Error loading signatures:', error);
        this.toastr.error('Failed to load signatures');
      }
    });
  }

  // Add new signature with improved logging
  addNewSignature() {
    if (!this.newSignatureName || !this.newSignatureFile) {
      return;
    }

    console.log('Adding new signature:');
    console.log('Name:', this.newSignatureName);
    console.log('File type:', this.newSignatureFile.type);
    console.log('File size:', this.newSignatureFile.size, 'bytes');

    const formData = new FormData();
    formData.append('name', this.newSignatureName);
    formData.append('signature', this.newSignatureFile);

    this.httpClient.post<any>('api/media-libary', formData).subscribe({
      next: (response) => {
        console.log('Signature added successfully:', response);
        console.log('Signature data available in response:', !!response.signatureData);
        
        // Reload signatures to get the updated list
        this.loadSavedSignatures();
        
        // Reset form
        this.newSignatureName = '';
        this.newSignatureFile = null;
        this.tempSignatureUrl = '';
        
        this.toastr.success('Signature added successfully');
      },
      error: (error) => {
        console.error('Error adding signature:', error);
        this.toastr.error('Failed to add signature: ' + (error.error?.message || error.message || 'Unknown error'));
      }
    });
  }

  // Delete signature
  deleteSignature(signatureId: string | number) {
    this.httpClient.delete(`api/delete-media-libary/${signatureId}`).subscribe({
      next: () => {
        // Remove from local array
        const index = this.savedSignatures.findIndex(sig => sig.id === signatureId);
        if (index > -1) {
          this.savedSignatures.splice(index, 1);
        }
      
        // If the deleted signature was selected, clear the selection
        if (this.selectedSignature?.id === signatureId) {
          this.selectedSignature = null;
          this.signatureImageUrl = '';
          this.documentForm.patchValue({ selectedSignature: '' });
        }
      
        this.toastr.success('Signature deleted successfully');
        this.cd.markForCheck();
      },
      error: (error) => {
        console.error('Error deleting signature:', error);
        this.toastr.error('Failed to delete signature: ' + (error.error?.message || error.message || 'Unknown error'));
      }
    });
  }

  // Handle new signature file selection with improved base64 conversion
  onNewSignatureSelect(event: any) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        this.toastr.error('Signature image must be less than 2MB');
        return;
      }
      
      this.newSignatureFile = file;
      // Convert to base64 for preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.tempSignatureUrl = e.target.result;
        console.log('Local file converted to base64:');
        console.log('File type:', file.type);
        console.log('Base64 data preview:', this.tempSignatureUrl.substring(0, 100) + '...');
        this.cd.markForCheck();
      };
      reader.readAsDataURL(file);
    } else {
      this.toastr.error('Please select a valid image file');
    }
  }

  // Select signature for use
  selectSignature(signature: Signature) {
    console.log('Selected signature:', signature);
    console.log('Signature URL:', signature.url);
    console.log('Signature data available:', !!signature.signatureData);
    if (signature.signatureData) {
      console.log('Signature data length:', signature.signatureData.length);
      console.log('Signature data preview:', signature.signatureData.substring(0, 100) + '...');
    }
    
    this.selectedSignature = signature;
    this.signatureImageUrl = signature.signatureData || signature.url;
    console.log('Final signatureImageUrl set to:', this.signatureImageUrl);
    this.documentForm.patchValue({ selectedSignature: signature.id });
    this.closeSignatureModal();
    this.cd.markForCheck();
  }

  // Handle signature selection from dropdown
  onSignatureSelect(event: any) {
    const signatureId = event.target.value;
    console.log('Signature selected from dropdown, ID:', signatureId);
    
    if (signatureId) {
      const signature = this.savedSignatures.find(sig => sig.id == signatureId);
      console.log('Found signature:', signature);
      
      if (signature) {
        this.selectedSignature = signature;
        this.signatureImageUrl = signature.signatureData || signature.url;
        console.log('Setting signatureImageUrl to:', this.signatureImageUrl);
        console.log('Signature data available:', !!signature.signatureData);
        this.cd.markForCheck();
      }
    } else {
      this.selectedSignature = null;
      this.signatureImageUrl = '';
      this.cd.markForCheck();
    }
  }

  // Image load handlers
  onImageLoad(event: Event, signature: Signature): void {
    console.log('Image loaded successfully for signature:', signature.name);
    console.log('Image source used:', (event.target as HTMLImageElement).src.substring(0, 50) + '...');
  }

  onImageError(event: Event, signature: Signature): void {
    console.error('Image failed to load for signature:', signature.name);
    console.error('Image source that failed:', (event.target as HTMLImageElement).src.substring(0, 50) + '...');
    console.error('URL property:', signature.url);
    console.error('Has signature_data:', !!signature.signatureData);
    
    // Try to fallback to URL if signature_data failed
    if (signature.signatureData && (event.target as HTMLImageElement).src === signature.signatureData) {
      console.log('Trying fallback to URL');
      (event.target as HTMLImageElement).src = signature.url;
    }
  }

  onPreviewImageLoad(event: Event): void {
    console.log('Preview image loaded successfully');
    console.log('Preview image source:', (event.target as HTMLImageElement).src.substring(0, 50) + '...');
  }

  onPreviewImageError(event: Event): void {
    console.error('Preview image failed to load');
    console.error('Preview image source that failed:', (event.target as HTMLImageElement).src.substring(0, 50) + '...');
    
    // Try to use a placeholder image
    if (this.selectedSignature && this.selectedSignature.url) {
      console.log('Trying fallback to URL for preview');
      (event.target as HTMLImageElement).src = this.selectedSignature.url;
    }
  }
}
