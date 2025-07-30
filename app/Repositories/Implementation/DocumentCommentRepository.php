<?php

namespace App\Repositories\Implementation;

use App\Models\DocumentComments;
use App\Repositories\Implementation\BaseRepository;
use App\Repositories\Contracts\DocumentCommentRepositoryInterface;
use Illuminate\Support\Facades\DB;

//use Your Model

/**
 * Class DocumentCommentRepository.
 */
class DocumentCommentRepository extends BaseRepository implements DocumentCommentRepositoryInterface
{
    /**
     * @var Model
     */
    protected $model;
    
    /**
     * BaseRepository constructor..
     *
     *
     * @param Model $model
     */


    public static function model()
    {
        return DocumentComments::class;
    }

    public function getDocumentComment($id)
    {
        $query = DocumentComments::select([
                'documentComments.*', 
                DB::raw("CONCAT(users.firstName,' ', users.lastName) as createdByName"),
                'documentStatus.name as statusName',
                'documentStatus.colorCode as statusColorCode'
            ])
            ->join('users', 'documentComments.createdBy', '=', 'users.id')
            ->leftJoin('documentStatus', 'documentComments.statusId', '=', 'documentStatus.id')
            ->where('documentId', $id)
            ->orderBy('documentComments.createdDate', 'desc');

        $results = $query->get();

        return $results;
    }

    public function deleteDocumentComments($id)
    {
        return DocumentComments::destroy($id);
    }
}
