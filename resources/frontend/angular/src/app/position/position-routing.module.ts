import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AuthGuard } from '@core/security/auth.guard';
import { PositionListComponent } from './position-list/position-list.component';

const routes: Routes = [
  {
    path: '',
    component: PositionListComponent,
    data: { claimType: 'DOCUMENT_CATEGORY_MANAGE_DOCUMENT_CATEGORY' },
    canActivate: [AuthGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PositionRoutingModule {} 