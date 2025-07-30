import { Component, inject, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { DocumentComment } from '@core/domain-classes/document-comment';
import { TranslateModule } from '@ngx-translate/core';
import { DocumentStatusStore } from 'src/app/document-status/store/document-status.store';
import { NgSelectModule } from '@ng-select/ng-select';
import { DocumentCommentService } from '../../document-comment/document-comment.service';
import { NgFor, NgIf } from '@angular/common';
import { CommonDialogService } from '@core/common-dialog/common-dialog.service';
import { TranslationService } from '@core/services/translation.service';
import { ToastrService } from 'ngx-toastr';
import { FormBuilder, ReactiveFormsModule, UntypedFormGroup, Validators } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-document-comments',
  standalone: true,
  imports: [
    TranslateModule,
    NgFor,
    NgIf,
    SharedModule,
    ReactiveFormsModule,
    NgSelectModule
  ],
  templateUrl: './document-comments.component.html',
  styleUrl: './document-comments.component.scss'
})
export class DocumentCommentsComponent implements OnChanges, OnInit {
  @Input() documentId: string = '';
  @Input() shouldLoad = false;
  @Input() documentName: string = '';
  documentComments: DocumentComment[] = [];
  commentForm: UntypedFormGroup;
  fb = inject(FormBuilder);
  showNumberInput = false;
  numberInputValue: string = '';
  isDirectorGeneral = false;
  // selectedStatus: string = '';
  selectedStatusId: string = null;
  // currentStatus: 'Pending' | 'In Progress' | 'Completed' = 'Pending';
  documentstatusStore = inject(DocumentStatusStore);
  documentDueDate: Date | null = null;
  httpClient = inject(HttpClient);

  // Abbreviation mappings
  private abbreviations = {
    'FYI': 'For Your Information',
    'ASAP': 'As Soon As Possible',
    'NB': 'Note Well',
    'PS': 'Post Script'
  };

  documentCommentService = inject(DocumentCommentService);
  commonDialogService = inject(CommonDialogService);
  translationService = inject(TranslationService);
  toastrService = inject(ToastrService);

  ngOnInit(): void {
    this.createForm();
    this.checkUserPosition();
    this.getDocumentDueDate();
  }

  checkUserPosition() {
    this.httpClient.get<{ dept: string, pst: string }>('api/user-position')
      .subscribe(result => {
        this.isDirectorGeneral = result.pst === 'Director General';
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['shouldLoad'] && this.shouldLoad) {
      this.getDocumentComments();

    }
  }

  createForm() {
    this.commentForm = this.fb.group({
      comment: ['', [Validators.required]],
    });
  }


  getDocumentComments() {
    this.documentCommentService
      .getDocumentComment(this.documentId)
      .subscribe((c: DocumentComment[]) => {
        this.documentComments = c;
      });
  }

  getDocumentDueDate() {
    this.httpClient.get<any>(`api/DocumentRolePermission/${this.documentId}`)
      .subscribe(response => {
        if (response && response.documentUserPermissions && response.documentUserPermissions.length > 0) {
          const endDate = response.documentUserPermissions[0].endDate;
          this.documentDueDate = endDate ? new Date(endDate) : null;
        }
      });
  }

  setStatus(statusId: string) {
    this.selectedStatusId = statusId;
  }

  addComment() {
    if (this.commentForm.invalid) {
      this.commentForm.markAllAsTouched();
      return;
    }
    // Get stored expiry date from localStorage
    const storageKey = `doc_expiry_${this.documentId}_${this.documentName}`;
    const storedDate = localStorage.getItem(storageKey);

    const documentComment: DocumentComment = {
      documentId: this.documentId,
      comment: this.commentForm.get('comment').value,
      statusId: this.selectedStatusId,
      endDate: storedDate ? new Date(storedDate) : null
    };
    this.documentCommentService
      .saveDocumentComment(documentComment)
      .subscribe(() => {
        this.patchComment('');
        this.commentForm.markAsUntouched();
        this.getDocumentComments();
      });
  }

  patchComment(comment: string) {
    this.commentForm.patchValue({
      comment: comment,
    });
  }

  onDelete(id: string) {
    this.commonDialogService
      .deleteConformationDialog(
        this.translationService.getValue('ARE_YOU_SURE_YOU_WANT_TO_DELETE')
      )
      .subscribe((isTrue: boolean) => {
        if (isTrue) {
          this.documentCommentService
            .deleteDocumentComment(id)
            .subscribe(() => {
              this.toastrService.success(
                this.translationService.getValue(`COMMENT_DELETED_SUCCESSFULLY`)
              );
              this.getDocumentComments();
            });
        }
      });
  }

  appendAbbreviation(abbr: string) {
    const currentComment = this.commentForm.get('comment').value || '';
    const expansion = this.abbreviations[abbr];
    const separator = currentComment ? ' ' : '';
    const newComment = currentComment + separator + expansion;
    this.commentForm.patchValue({ comment: newComment });
  }

  toggleNumberInput() {
    this.showNumberInput = !this.showNumberInput;
    if (!this.showNumberInput) {
      this.numberInputValue = '';
    }
  }

  convertNumberToWords() {
    if (!this.numberInputValue) return;

    const number = parseInt(this.numberInputValue);
    if (isNaN(number)) {
      this.toastrService.error('Please enter a valid number');
      return;
    }

    const words = this.numberToWords(number);
    const currentComment = this.commentForm.get('comment').value || '';
    const separator = currentComment ? ' ' : '';
    const newComment = currentComment + separator + words;
    this.commentForm.patchValue({ comment: newComment });
    this.numberInputValue = '';
    this.showNumberInput = false;
  }

  private numberToWords(num: number): string {
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];

    if (num === 0) return 'Zero naira';

    const convertLessThanThousand = (n: number): string => {
      if (n === 0) return '';

      if (n < 10) return ones[n];

      if (n < 20) return teens[n - 10];

      if (n < 100) {
        return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + ones[n % 10] : '');
      }

      return ones[Math.floor(n / 100)] + ' hundred' + (n % 100 !== 0 ? ' and ' + convertLessThanThousand(n % 100) : '');
    };

    let result = '';

    if (num < 1000) {
      result = convertLessThanThousand(num);
      return this.capitalizeFirstLetter(result + (num === 100 ? ' naira' : ' naira'));
    }

    if (num < 1000000) {
      const thousands = Math.floor(num / 1000);
      const remainder = num % 1000;

      result = convertLessThanThousand(thousands) + ' thousand';
      if (remainder > 0) {
        result += ', ' + convertLessThanThousand(remainder);
      }
      return this.capitalizeFirstLetter(result + ' naira');
    }

    if (num < 1000000000) {
      const millions = Math.floor(num / 1000000);
      const remainder = num % 1000000;

      result = convertLessThanThousand(millions) + ' million';
      if (remainder > 0) {
        const thousandsRemainder = Math.floor(remainder / 1000);
        if (thousandsRemainder > 0) {
          result += ', ' + convertLessThanThousand(thousandsRemainder) + ' thousand';
        }
        const finalRemainder = remainder % 1000;
        if (finalRemainder > 0) {
          result += ', ' + convertLessThanThousand(finalRemainder);
        }
      }
      return this.capitalizeFirstLetter(result + ' naira');
    }

    if (num < 1000000000000) {
      const billions = Math.floor(num / 1000000000);
      const remainder = num % 1000000000;

      result = convertLessThanThousand(billions) + ' billion';
      if (remainder > 0) {
        const millionsRemainder = Math.floor(remainder / 1000000);
        if (millionsRemainder > 0) {
          result += ', ' + convertLessThanThousand(millionsRemainder) + ' million';
        }
        const thousandsRemainder = Math.floor((remainder % 1000000) / 1000);
        if (thousandsRemainder > 0) {
          result += ', ' + convertLessThanThousand(thousandsRemainder) + ' thousand';
        }
        const finalRemainder = remainder % 1000;
        if (finalRemainder > 0) {
          result += ', ' + convertLessThanThousand(finalRemainder);
        }
      }
      return this.capitalizeFirstLetter(result + ' naira');
    }

    return 'Amount too large';
  }

  private capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

