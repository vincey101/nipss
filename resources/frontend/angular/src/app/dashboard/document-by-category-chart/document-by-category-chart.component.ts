import { Component, OnInit, inject } from '@angular/core';
import { DashboradService } from '../dashboard.service';
import { DocumentLibraryService } from 'src/app/document-library/document-library.service';
import { ReminderService } from 'src/app/reminder/reminder.service';
import { DocumentResource } from '@core/domain-classes/document-resource';
import { ResponseHeader } from '@core/domain-classes/document-header';
import { HttpResponse } from '@angular/common/http';
import { DocumentInfo } from '@core/domain-classes/document-info';
import { forkJoin, of } from 'rxjs';
import { CommonError } from '@core/error-handler/common-error';
import { ReminderResourceParameter } from '@core/domain-classes/reminder-resource-parameter';
import { DocumentStatusStore } from 'src/app/document-status/store/document-status.store';

@Component({
  selector: 'app-document-by-category-chart',
  templateUrl: './document-by-category-chart.component.html',
  styleUrls: ['./document-by-category-chart.component.scss']
})
export class DocumentByCategoryChartComponent implements OnInit {
  documentCards: any[] = [];
  
  // Card colors and icons
  cardColors = [
    '#6778EF', // Blue
    '#E5AB72', // Orange
    '#355E3B', // Green
    '#ff7fff', // Purple
    '#65CC65', // Green
    '#FF5A5A'  // Red
  ];
  
  cardIcons = [
    'description',        // Document icon
    'today',              // Calendar today icon
    'check_circle',       // Complete/checked circle
    'pending_actions',    // Pending actions
    'verified',           // Verified/completed
    'notifications'       // Notifications/reminders
  ];
  
  loading = true;
  hasError = false;
  completedStatusId = '';
  
  // Inject services
  private dashboardService = inject(DashboradService);
  private documentService = inject(DocumentLibraryService);
  private reminderService = inject(ReminderService);
  private documentStatusStore = inject(DocumentStatusStore);
  
  constructor() { }

  ngOnInit(): void {
    // Explicitly load document statuses first
    this.documentStatusStore.loadDocumentStatus();
    
    // If statuses are already loaded, get metrics right away
    if (this.documentStatusStore.statusList().length > 0) {
      this.findStatusIdsAndGetMetrics();
    } else {
      // Otherwise, wait a bit and check again
      setTimeout(() => {
        if (this.documentStatusStore.statusList().length > 0) {
          this.findStatusIdsAndGetMetrics();
        } else {
          // If still no statuses, try one last time after a longer delay
          setTimeout(() => this.findStatusIdsAndGetMetrics(), 2000);
        }
      }, 1000);
    }
  }
  
  findStatusIdsAndGetMetrics() {
    // Find status IDs for completed
    const statusList = this.documentStatusStore.statusList();
    
    if (statusList.length > 0) {
      // Try multiple variations of "completed" status
      const completedStatus = statusList.find(s => 
        s.name.toLowerCase() === 'complete' || 
        s.name.toLowerCase() === 'completed' ||
        s.name.toLowerCase().includes('complete'));
      
      if (completedStatus) {
        this.completedStatusId = completedStatus.id;
      } else {
        console.warn('Could not find completed status in:', statusList);
      }
    } else {
      console.warn('No document statuses found');
    }
    
    // Get document metrics with whatever status data we have
    this.getDocumentMetrics();
  }

  getDocumentMetrics() {
    console.log('Getting document metrics with completed status ID:', this.completedStatusId);
    
    // Create resource objects for different queries
    const allDocumentsResource = new DocumentResource();
    allDocumentsResource.pageSize = 100; // Get more documents to ensure accuracy
    
    const todayDocumentsResource = new DocumentResource();
    todayDocumentsResource.pageSize = 100;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    todayDocumentsResource.createDate = today.toISOString();
    todayDocumentsResource.orderBy = 'createdDate desc'; // Add sorting by creation date
    
    const completedDocumentsResource = new DocumentResource();
    completedDocumentsResource.pageSize = 100;
    if (this.completedStatusId) {
      completedDocumentsResource.statusId = this.completedStatusId;
    }
    
    const completedTodayDocumentsResource = new DocumentResource();
    completedTodayDocumentsResource.pageSize = 100;
    if (this.completedStatusId) {
      completedTodayDocumentsResource.statusId = this.completedStatusId;
    }
    completedTodayDocumentsResource.createDate = today.toISOString();
    completedTodayDocumentsResource.orderBy = 'createdDate desc'; // Add sorting by creation date

    const reminderResourceParameter = new ReminderResourceParameter();
    reminderResourceParameter.pageSize = 100;
    reminderResourceParameter.skip = 0;
    reminderResourceParameter.orderBy = 'startDate desc';

    const allDocuments$ = this.documentService.getDocuments(allDocumentsResource);
    const todayDocuments$ = this.documentService.getDocuments(todayDocumentsResource);
    const completedDocuments$ = this.documentService.getDocuments(completedDocumentsResource);
    const completedTodayDocuments$ = this.documentService.getDocuments(completedTodayDocumentsResource);
    const reminders$ = this.reminderService.getReminders(reminderResourceParameter);

    forkJoin({
      allDocuments: allDocuments$,
      todayDocuments: todayDocuments$,
      completedDocuments: completedDocuments$,
      completedTodayDocuments: completedTodayDocuments$,
      reminders: reminders$
    }).subscribe({
      next: (results) => {
        console.log('Document metrics API results:', results);
        
        // Get counts directly from the response body length or headers
        let allDocumentsCount = 0;
        let todayDocumentsCount = 0;
        let completedDocumentsCount = 0;
        let completedTodayDocumentsCount = 0;
        let remindersCount = 0;
        
        if (results.allDocuments && 'body' in results.allDocuments) {
          allDocumentsCount = this.extractCount(results.allDocuments);
        }
        
        if (results.todayDocuments && 'body' in results.todayDocuments) {
          // Filter documents that were actually created today
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);
          
          const todayDocs = results.todayDocuments.body.filter(doc => {
            const createdDate = new Date(doc.createdDate);
            return createdDate >= todayStart && createdDate <= todayEnd;
          });
          todayDocumentsCount = todayDocs.length;
        }
        
        if (results.completedDocuments && 'body' in results.completedDocuments) {
          completedDocumentsCount = this.extractCount(results.completedDocuments);
        }
        
        const pendingDocumentsCount = Math.max(0, allDocumentsCount - completedDocumentsCount);
        
        if (results.completedTodayDocuments && 'body' in results.completedTodayDocuments) {
          // Filter completed documents that were actually created today
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);
          
          const completedTodayDocs = results.completedTodayDocuments.body.filter(doc => {
            const createdDate = new Date(doc.createdDate);
            return createdDate >= todayStart && createdDate <= todayEnd;
          });
          completedTodayDocumentsCount = completedTodayDocs.length;
        }
        
        if (results.reminders && 'body' in results.reminders) {
          remindersCount = results.reminders.body.length;
        }

        this.documentCards = [
          {
            name: 'Total Memo',
            count: allDocumentsCount || 0,
            color: this.cardColors[0],
            icon: this.cardIcons[0],
            route: ''
          },
          {
            name: 'Total Memo Today',
            count: todayDocumentsCount || 0,
            color: this.cardColors[1],
            icon: this.cardIcons[1],
            route: ''
          },
          {
            name: 'Total Completed Memo',
            count: completedDocumentsCount || 0,
            color: this.cardColors[2],
            icon: this.cardIcons[2],
            route: ''
          },
          {
            name: 'Total Pending Memo',
            count: pendingDocumentsCount || 0,
            color: this.cardColors[3],
            icon: this.cardIcons[3],
            route: ''
          },
          {
            name: 'Total Completed Memo Today',
            count: completedTodayDocumentsCount || 0,
            color: this.cardColors[4],
            icon: this.cardIcons[4],
            route: ''
          },
          {
            name: 'Total Reminders',
            count: remindersCount || 0,
            color: this.cardColors[5],
            icon: this.cardIcons[5],
            route: '/reminders'
          }
        ];
        
        this.loading = false;
        this.hasError = false;
      },
      error: (error) => {
        if (error.status === 403) {
          this.hasError = true;
        }
        this.loading = false;
      }
    });
  }
  
  // Helper method to extract count from response
  private extractCount(response: HttpResponse<DocumentInfo[]> | CommonError): number {
    if (!response || !('headers' in response)) return 0;
    
    try {
      const paginationHeader = response.headers.get('X-Pagination');
      if (paginationHeader) {
        const paginationParam = JSON.parse(paginationHeader) as ResponseHeader;
        return paginationParam.totalCount || 0;
      } else if (response.body) {
        // If header is not available, use body length
        return response.body.length;
      }
    } catch (error) {
      console.error('Error parsing pagination header', error);
    }
    
    return 0;
  }
}
