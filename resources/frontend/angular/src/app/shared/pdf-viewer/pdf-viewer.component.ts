import { HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { DocumentView } from '@core/domain-classes/document-view';
import { CommonService } from '@core/services/common.service';
import { OverlayPanelRef } from '@shared/overlay-panel/overlay-panel-ref';
import { ToastrService } from 'ngx-toastr';
import { BaseComponent } from 'src/app/base.component';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { DocumentService } from 'src/app/document/document.service';
import { DocumentVersion } from '@core/domain-classes/documentVersion';

@Component({
  selector: 'app-pdf-viewer',
  templateUrl: './pdf-viewer.component.html',
  styleUrls: ['./pdf-viewer.component.scss']
})
export class PdfViewerComponent extends BaseComponent implements OnChanges {
  @Input() document: DocumentView;
  loadingTime = 2000;
  documentUrl: Blob = null;
  
  constructor(
    private commonService: CommonService,
    private toastrService: ToastrService,
    private overlayRef: OverlayPanelRef,
    private documentService: DocumentService,
    private router: Router
  ) {
    super();
  }

  async captureScreenshot() {
    try {
      // Get only the PDF content area without the toolbar
      const pdfContentElement = document.querySelector('.page') as HTMLElement;
      
      if (!pdfContentElement) {
        this.toastrService.error('PDF content element not found');
        return;
      }

      // Use html2canvas to capture the screenshot
      const canvas = await html2canvas(pdfContentElement, {
        logging: false,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        ignoreElements: (element) => {
          return element.classList.contains('toolbar') || 
                 element.id === 'toolbarContainer' || 
                 element.id === 'toolbarViewer';
        }
      });

      // Calculate dimensions for PDF (A4 format)
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      // Create PDF document
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: true
      });
      
      // Add the canvas image to PDF
      const imgData = canvas.toDataURL('image/png', 1.0);
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight, '', 'FAST');
      
      // Get PDF as blob
      const pdfBlob = pdf.output('blob');
      
      // Create file from blob
      const fileName = this.document?.name || 'document.pdf';
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

      // Create document version object
      const documentVersion: DocumentVersion = {
        documentId: this.document.documentId,
        fileData: pdfFile,
        location: 's3' // Hardcoded

      };

      // Save to API
      this.sub$.sink = this.documentService
        .saveNewVersionDocument(documentVersion)
        .subscribe({
          next: () => {
            this.toastrService.success('Memo Saved Successfully');
            this.overlayRef.close();
            this.router.navigate(['/']);
          },
          error: (error) => {
            console.error('Error saving document version:', error);
            this.toastrService.error('Failed to save Memo');
          }
        });

    } catch (error) {
      console.error('PDF capture failed:', error);
      this.toastrService.error('Failed to capture Memo');
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['document']) {
      this.getDocument();
    }
  }

  getDocument() {
    this.sub$.sink = this.commonService
      .downloadDocument(this.document)
      .subscribe({
        next: (event: HttpEvent<Blob>) => {
          if (event.type === HttpEventType.Response) {
            this.downloadFile(event);
          }
        },
        error: (err) => {
          this.toastrService.error(err.error.message);
          this.onCancel();
        },
      });
  }

  downloadFile(data: HttpResponse<Blob>) {
    this.documentUrl = new Blob([data.body], { type: data.body.type });
  }

  onCancel() {
    this.overlayRef.close();
  }
}
