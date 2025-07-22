import { Direction } from '@angular/cdk/bidi';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  AfterViewInit,
  OnInit,
  inject,
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
import { Router } from '@angular/router';
import { Role } from '@core/domain-classes/role';
import { User } from '@core/domain-classes/user';
import { DocumentInfo } from '@core/domain-classes/document-info';
import { SecurityService } from '@core/security/security.service';
import { CommonService } from '@core/services/common.service';
import { TranslationService } from '@core/services/translation.service';
import { DocumentService } from '../document/document.service';
import { BaseComponent } from 'src/app/base.component';
import { OpenAIService } from '@core/services/openai.service';
import { UserStore } from 'src/app/user/store/user-store';
import { Observable, catchError, of, from } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { Category } from '@core/domain-classes/category';
import { CategoryService } from '@core/services/category.service';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { concatMap } from 'rxjs/operators';
import { FileInfo } from '@core/domain-classes/file-info';
import { DocumentAuditTrail } from '@core/domain-classes/document-audit-trail';
import { DocumentOperation } from '@core/domain-classes/document-operation';

// Declare Quill as global variable
declare var Quill: any;

interface Signature {
  id: number;
  name: string;
  url: string;
  signatureData?: string;
  createdAt?: string;
  updatedAt?: string;
}

@Component({
  selector: 'app-memo-broadcast',
  templateUrl: './memo-broadcast.component.html',
  styleUrls: ['./memo-broadcast.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MemoBroadcastComponent extends BaseComponent implements OnInit, AfterViewInit {
  documentForm: UntypedFormGroup;
  showModal = false;
  loading = false;
  isGenerating = false;
  aiPrompt = '';
  errorMessage = '';
  userDepartment: string = '';
  private quillEditor: any;
  roles: Role[] = [];
  minDate: Date;
  direction: Direction;
  userStore = inject(UserStore);
  private router = inject(Router);
  private documentService = inject(DocumentService);
  private toastr = inject(ToastrService);
  categories: Category[] = [];
  allCategories: Category[] = [];
  counter = 0;
  resultArray: { isSuccess: boolean; message: string; name: string }[] = [];
  fileData: any;
  extension = '';
  progress = 0;
  message = '';
  fileInfo: FileInfo;
  isFileUpload = false;
  signatureImageUrl: string | null = null;

  // Add signature management properties
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
    private commonService: CommonService,
    private securityService: SecurityService,
    private translationService: TranslationService,
    private openAIService: OpenAIService,
    private categoryService: CategoryService
  ) {
    super();
    this.minDate = new Date();
    // Remove loadSavedSignatures from constructor
  }

  ngOnInit(): void {
    console.log('Initializing memo-broadcast component...');
    this.createDocumentForm();
    this.loadUserData();
    this.getRoles();
    this.getCompanyProfile();
    this.getLangDir();
    this.getCategories();
    // Load signatures after form is created
    this.loadSavedSignatures();
    // Load user positions from UserStore
    this.userStore.loadUserPositions();
  }

  getLangDir() {
    this.sub$.sink = this.translationService.lanDir$.subscribe(
      (c: Direction) => (this.direction = c)
    );
  }

  getCompanyProfile() {
    this.securityService.companyProfile.subscribe((profile) => {
      if (profile) {
        // Handle company profile if needed
      }
    });
  }

  get fileInputs(): FormArray {
    return (<FormArray>this.documentForm.get('files')) as FormArray;
  }

  createDocumentForm() {
    console.log('Creating document form...');
    this.documentForm = this.fb.group({
      templateType: ['template1'],
      subject: ['', Validators.required],
      content: ['', Validators.required],
      toAllUsers: [false],
      selectedToUsers: [[]],
      selectedRoles: [[]],
      files: this.fb.array([]),
      url: [''],
      extension: [''],
      signaturePosition: ['right'],
      selectedSignature: [''], // Add selectedSignature control
      toUserPermissionForm: this.fb.group({
        isTimeBound: new UntypedFormControl(false),
        startDate: [''],
        endDate: [''],
        isAllowDownload: new UntypedFormControl(false),
      }),
      rolePermissionForm: this.fb.group({
        isTimeBound: new UntypedFormControl(false),
        startDate: [''],
        endDate: [''],
        isAllowDownload: new UntypedFormControl(false),
      })
    });

    // Subscribe to toAllUsers changes to clear selections when switched to true
    this.documentForm.get('toAllUsers').valueChanges.subscribe(checked => {
      if (checked) {
        this.documentForm.patchValue({
          selectedToUsers: [],
          selectedRoles: []
        });
      }
    });

    // Subscribe to selectedSignature changes
    this.documentForm.get('selectedSignature').valueChanges.subscribe(value => {
      console.log('Selected signature changed:', value);
      if (value) {
        const signature = this.savedSignatures.find(sig => sig.id == value);
        if (signature) {
          console.log('Found matching signature:', signature);
          this.selectedSignature = signature;
          this.signatureImageUrl = signature.signatureData || signature.url;
          this.cd.markForCheck();
        }
      } else {
        this.selectedSignature = null;
        this.signatureImageUrl = '';
        this.cd.markForCheck();
      }
    });
  }

  get rolePermissionFormGroup() {
    return this.documentForm.get('rolePermissionForm') as FormGroup;
  }

  get toUserPermissionFormGroup() {
    return this.documentForm.get('toUserPermissionForm') as FormGroup;
  }

  getRoles() {
    this.sub$.sink = this.commonService
      .getRolesForDropdown()
      .subscribe((roles: Role[]) => (this.roles = roles));
  }

  roleTimeBoundChange(event: MatCheckboxChange) {
    if (event.checked) {
      this.rolePermissionFormGroup.get('startDate').setValidators([Validators.required]);
      this.rolePermissionFormGroup.get('endDate').setValidators([Validators.required]);
    } else {
      this.rolePermissionFormGroup.get('startDate').clearValidators();
      this.rolePermissionFormGroup.get('endDate').clearValidators();
      this.rolePermissionFormGroup.get('startDate').setValue(null);
      this.rolePermissionFormGroup.get('endDate').setValue(null);
    }
    this.rolePermissionFormGroup.get('startDate').updateValueAndValidity();
    this.rolePermissionFormGroup.get('endDate').updateValueAndValidity();
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

  ngAfterViewInit(): void {
    // Initialize Quill after view init
    setTimeout(() => {
      this.initQuillEditor();
    }, 0);
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

  getCurrentDate(): Date {
    return new Date();
  }

  getCurrentUser(): string {
    const authObj = this.securityService.getUserDetail();
    if (authObj && authObj.user) {
      return `${authObj.user.firstName || ''} ${authObj.user.lastName || ''}`;
    }
    return '';
  }

  getSelectedToUsersString(): string {
    const selectedToUsers = this.documentForm?.get('selectedToUsers')?.value || [];
    const toUsersString = selectedToUsers.length > 0 ? 
      selectedToUsers.map(user => `${user.firstName} ${user.lastName}`).join(', ') : '';
    
    const selectedRoles = this.documentForm?.get('selectedRoles')?.value || [];
    const rolesString = selectedRoles.length > 0 ?
      selectedRoles.map(role => role.name).join(', ') : '';
    
    if (toUsersString && rolesString) {
      return `${toUsersString}, ${rolesString}`;
    } else {
      return toUsersString || rolesString || '';
    }
  }

  getSelectedThroughUsersString(): string {
    const selectedThroughUsers = this.documentForm?.get('selectedThroughUsers')?.value;
    if (!selectedThroughUsers || selectedThroughUsers.length === 0) {
      return '';
    }
    return selectedThroughUsers.map(user => {
      const userObj = user as any;
      return userObj.positionName || userObj.position || userObj.displayName || 
             `${userObj.firstName || userObj.firstname} ${userObj.lastName || userObj.lastname}`;
    }).join(', ');
  }

  openAiModal(): void {
    this.showModal = true;
    this.aiPrompt = '';
    this.errorMessage = '';
    
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

  SaveDocument() {
    if (this.documentForm.get('subject').invalid || this.documentForm.get('content').invalid) {
      this.documentForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.counter = 0;
    this.resultArray = [];

    // If toAllUsers is checked, get all users first
    if (this.documentForm.get('toAllUsers').value) {
      this.sub$.sink = this.commonService.getUsers().subscribe((users: User[]) => {
        // Set all users as selected users
        this.documentForm.patchValue({
          selectedToUsers: users.map(user => ({
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName
          }))
        });
        // Continue with document save process
        this.processDocumentSave();
      }, error => {
        this.loading = false;
        this.toastr.error('Error fetching users');
        console.error('Error fetching users:', error);
      });
    } else {
      // Continue with normal save process
      this.processDocumentSave();
    }
  }

  private processDocumentSave() {
    // Create array of file tasks
    const fileUploadTasks = [];
    
    // Add the PDF document export
    const pdfTask = this.exportToPDF(true)
      .then(pdfBlob => {
        if (!pdfBlob) return null;
        const pdfFile = new File([pdfBlob], 
          `${this.documentForm.get('subject').value.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`, 
          { type: 'application/pdf' }
        );
        return pdfFile;
      })
      .catch(error => {
        console.error('Error creating PDF', error);
        this.toastr.error('Error generating PDF document');
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
          // Validate file extension again just to be safe
          if (this.fileExtesionValidation(this.extension)) {
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
          } else {
            this.toastr.error('Invalid file type');
          }
        }
        
        // If we have files to process, save them
        if (this.fileInputs.length > 0) {
          this.processSaveDocuments();
        } else {
          this.loading = false;
          this.toastr.error('No valid files to process');
        }
      })
      .catch(error => {
        console.error('Error in file processing:', error);
        this.loading = false;
        this.toastr.error('Error processing files');
      });
  }

  processSaveDocuments() {
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
            this.toastr.error(document);
          } else {
            this.addDocumentTrail(document.id);
            this.resultArray.push({
              isSuccess: true,
              name: this.fileInputs.at(this.counter - 1).get('name').value,
              message: this.translationService.getValue('DOCUMENT_SAVE_SUCCESSFULLY')
            });
            this.toastr.success(this.translationService.getValue('DOCUMENT_SAVE_SUCCESSFULLY'));
          }
          
          if (this.counter === this.fileInputs.length) {
            this.loading = false;
            this.cd.markForCheck();
            
            // Navigate to documents page after saving is complete
            this.router.navigate(['/']);
          }
        },
        error: (error) => {
          console.error('Error saving documents:', error);
          this.loading = false;
          this.toastr.error('Error saving documents');
          this.cd.markForCheck();
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

  buildDocumentObject(): DocumentInfo {
    const document: DocumentInfo = {
      categoryId: this.userDepartment ? this.findDepartmentCategoryId(this.userDepartment) : '',
      description: '',
      name: this.documentForm.get('subject').value,
      documentMetaDatas: [],
      location: 'local',
      clientId: '',
      templateType: this.documentForm.get('templateType').value,
      subject: this.documentForm.get('subject').value,
      content: this.documentForm.get('content').value,
      toUserEndDate: this.toUserPermissionFormGroup.get('endDate').value,
      isAllUsers: this.documentForm.get('toAllUsers').value
    };
    
    // Initialize document user permissions array
    document.documentUserPermissions = [];
    document.documentRolePermissions = [];

    // Process selected roles
    const selectedRoles: Role[] = this.documentForm.get('selectedRoles').value ?? [];
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

    // Process selected users
    const selectedToUsers: User[] = this.documentForm.get('selectedToUsers').value ?? [];
    if (selectedToUsers?.length > 0) {
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
          
          // Special handling for contact information in template 2
          if (element.closest('.contact-info-block')) {
            element.style.setProperty('font-size', '7px', 'important');
          } else {
            element.style.setProperty('font-size', '10px', 'important');
          }
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
            .contact-info-block {
              font-size: 7px !important;
              line-height: 1.2 !important;
              padding-left: 55% !important;
              margin-top: -3px !important;
            }
            .contact-info-block p {
              margin-bottom: 1px !important;
            }
            .memo-details {
              background-color: #f5f5f5 !important;
            }
          `;
          clonedDoc.head.appendChild(globalStyle);
          
          // Apply black color to all elements in the cloned document
          const clonedPreview = clonedDoc.querySelector('.preview-box');
          if (clonedPreview) {
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
          }
          
          // Apply specific styling to contact information in the cloned document
          const contactInfo = clonedDoc.querySelector('.contact-info-block') as HTMLElement;
          if (contactInfo) {
            contactInfo.style.setProperty('padding-left', '63%', 'important');
            contactInfo.style.setProperty('margin-top', '-3px', 'important');
            const paragraphs = contactInfo.querySelectorAll('p');
            paragraphs.forEach(p => {
              (p as HTMLElement).style.setProperty('font-size', '7px', 'important');
              (p as HTMLElement).style.setProperty('line-height', '1.2', 'important');
              (p as HTMLElement).style.setProperty('margin-bottom', '1px', 'important');
            });
          }
        }
      }).then(canvas => {
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

  findDepartmentCategoryId(departmentName: string): string {
    // Find matching category by name
    const matchingCategory = this.allCategories.find(cat => 
      cat.name.toLowerCase() === departmentName.toLowerCase()
    );
    return matchingCategory ? matchingCategory.id : '';
  }

  loadUserData() {
    // Make a call to get the user's department and position
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

  getCategories() {
    this.categoryService.getAllCategoriesForDropDown().subscribe((c) => {
      this.categories = c;
      this.setDeafLevel();
    });
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
  }

  fileUploadExtensionValidation(extension: string) {
    this.documentForm.patchValue({
      extension: extension,
    });
    this.documentForm.get('extension').markAsTouched();
    this.documentForm.updateValueAndValidity();
  }

  fileExtesionValidation(extension: string): boolean {
    // For memo broadcast, we'll allow common document formats
    const allowedExtensions = ['pdf', 'doc', 'docx', 'txt'];
    return allowedExtensions.includes(extension.toLowerCase());
  }

  // Add signature upload handler
  uploadSignature(event: any) {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        this.toastr.error('Please upload a valid image file (PNG, JPG, JPEG)');
        return;
      }

      // Create URL for preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.signatureImageUrl = e.target.result;
        this.cd.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  // Add signature management methods
  openSignatureManager(): void {
    this.showSignatureModal = true;
  }

  closeSignatureModal(): void {
    this.showSignatureModal = false;
    this.newSignatureName = '';
    this.newSignatureFile = null;
    this.tempSignatureUrl = '';
  }

  // Load signatures from API with enhanced debugging
  loadSavedSignatures(): void {
    console.log('Starting to load signatures...');
    this.httpClient.get<Signature[]>('api/get-media-libary').subscribe({
      next: (signatures) => {
        console.log('API Response received:', signatures);
        console.log('Number of signatures:', signatures?.length || 0);
        
        if (signatures && signatures.length > 0) {
          signatures.forEach((sig, index) => {
            console.log(`Signature ${index + 1}:`, {
              id: sig.id,
              name: sig.name,
              hasUrl: !!sig.url,
              hasSignatureData: !!sig.signatureData,
              urlPreview: sig.url ? sig.url.substring(0, 50) + '...' : 'No URL',
              dataPreview: sig.signatureData ? sig.signatureData.substring(0, 50) + '...' : 'No signature data'
            });
          });
        } else {
          console.log('No signatures found in response');
        }
        
        this.savedSignatures = signatures || [];
        console.log('Updated savedSignatures array:', this.savedSignatures);
        this.cd.markForCheck();
        console.log('Change detection triggered');
      },
      error: (error) => {
        console.error('Error loading signatures:', error);
        console.error('Error details:', {
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          error: error.error
        });
        this.toastr.error('Failed to load signatures: ' + (error.error?.message || error.message || 'Unknown error'));
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

  // Select signature for use with enhanced error handling
  selectSignature(signature: Signature) {
    try {
      console.log('Selecting signature:', signature);
      console.log('Signature details:', {
        id: signature.id,
        name: signature.name,
        hasUrl: !!signature.url,
        hasSignatureData: !!signature.signatureData
      });
      
      this.selectedSignature = signature;
      
      // Try signature_data first, fallback to URL
      if (signature.signatureData) {
        console.log('Using signature data');
        this.signatureImageUrl = signature.signatureData;
      } else if (signature.url) {
        console.log('Using signature URL');
        this.signatureImageUrl = signature.url;
      } else {
        console.error('No valid signature source found');
        this.toastr.error('Invalid signature data');
        return;
      }
      
      console.log('Setting form value:', signature.id);
      this.documentForm.patchValue({ selectedSignature: signature.id });
      this.closeSignatureModal();
      this.cd.markForCheck();
      console.log('Signature selection complete');
    } catch (error) {
      console.error('Error selecting signature:', error);
      this.toastr.error('Error selecting signature');
    }
  }

  // Handle signature selection from dropdown with enhanced error handling
  onSignatureSelect(event: any) {
    try {
      const signatureId = event.target.value;
      console.log('Signature selected from dropdown:', {
        eventValue: event.target.value,
        parsedId: signatureId
      });
      
      if (signatureId) {
        const signature = this.savedSignatures.find(sig => sig.id == signatureId);
        console.log('Found signature:', signature);
        
        if (signature) {
          this.selectedSignature = signature;
          
          // Try signature_data first, fallback to URL
          if (signature.signatureData) {
            console.log('Using signature data');
            this.signatureImageUrl = signature.signatureData;
          } else if (signature.url) {
            console.log('Using signature URL');
            this.signatureImageUrl = signature.url;
          } else {
            console.error('No valid signature source found');
            this.toastr.error('Invalid signature data');
            return;
          }
          
          this.cd.markForCheck();
        } else {
          console.error('Signature not found for ID:', signatureId);
          this.toastr.error('Selected signature not found');
        }
      } else {
        console.log('Clearing signature selection');
        this.selectedSignature = null;
        this.signatureImageUrl = '';
        this.cd.markForCheck();
      }
    } catch (error) {
      console.error('Error in signature selection:', error);
      this.toastr.error('Error selecting signature');
    }
  }

  // Image load handlers with enhanced error handling
  onImageLoad(event: Event, signature: Signature): void {
    try {
      console.log('Image loaded successfully:', {
        signatureName: signature.name,
        signatureId: signature.id,
        src: (event.target as HTMLImageElement).src.substring(0, 50) + '...'
      });
    } catch (error) {
      console.error('Error in image load handler:', error);
    }
  }

  onImageError(event: Event, signature: Signature): void {
    try {
      console.error('Image failed to load:', {
        signatureName: signature.name,
        signatureId: signature.id,
        src: (event.target as HTMLImageElement).src.substring(0, 50) + '...',
        hasUrl: !!signature.url,
        hasSignatureData: !!signature.signatureData
      });
      
      const imgElement = event.target as HTMLImageElement;
      
      // If signature_data failed, try URL
      if (signature.signatureData && imgElement.src === signature.signatureData && signature.url) {
        console.log('Trying fallback to URL');
        imgElement.src = signature.url;
      } else {
        console.error('No fallback available');
        this.toastr.error('Failed to load signature image');
      }
    } catch (error) {
      console.error('Error in image error handler:', error);
    }
  }

  onPreviewImageLoad(event: Event): void {
    try {
      console.log('Preview image loaded successfully');
    } catch (error) {
      console.error('Error in preview image load handler:', error);
    }
  }

  onPreviewImageError(event: Event): void {
    try {
      console.error('Preview image failed to load');
      
      // Try to use a placeholder image
      if (this.selectedSignature?.url) {
        console.log('Trying fallback to URL for preview');
        (event.target as HTMLImageElement).src = this.selectedSignature.url;
      } else {
        console.error('No fallback available for preview');
        this.toastr.error('Failed to load signature preview');
      }
    } catch (error) {
      console.error('Error in preview image error handler:', error);
    }
  }
} 