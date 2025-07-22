<?php

namespace App\Repositories\Implementation;

use App\Models\Positions;
use App\Models\Documents;
use App\Repositories\Implementation\BaseRepository;
use App\Repositories\Contracts\PositionRepositoryInterface;

class PositionRepository extends BaseRepository implements PositionRepositoryInterface
{

    /**
     * @var Model
     */
    protected $model;

    /**
     * BaseRepository constructor.
     *
     * @param Model $model
     */
    public static function model()
    {
        return Positions::class;
    }

    public function deletePosition($id)
    {
        $document = Documents::where('categoryId', '=', $id)->first();

        if (!is_null($document)) {
            return false;
        } else {
            $this->delete($id);
            return true;
        }
    }
}
