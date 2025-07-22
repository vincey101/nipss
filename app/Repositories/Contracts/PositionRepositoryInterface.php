<?php

namespace App\Repositories\Contracts;
use App\Repositories\Contracts\BaseRepositoryInterface;

interface PositionRepositoryInterface extends BaseRepositoryInterface
{
    public function deletePosition($id);
}