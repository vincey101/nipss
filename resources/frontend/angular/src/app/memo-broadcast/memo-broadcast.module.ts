import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { MemoBroadcastComponent } from './memo-broadcast.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { OpenAIService } from '@core/services/openai.service';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { NgSelectModule } from '@ng-select/ng-select';
import { OwlDateTimeModule, OwlNativeDateTimeModule } from 'ng-pick-datetime-ex';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { SharedModule } from '@shared/shared.module';
import { MatIconModule } from '@angular/material/icon';
import { DocumentService } from '../document/document.service';

const routes: Routes = [
  {
    path: '',
    component: MemoBroadcastComponent
  }
];

@NgModule({
  declarations: [
    MemoBroadcastComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule.forChild(routes),
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    NgSelectModule,
    OwlDateTimeModule,
    OwlNativeDateTimeModule,
    TranslateModule,
    SharedModule
  ],
  providers: [OpenAIService, DocumentService]
})
export class MemoBroadcastModule { }