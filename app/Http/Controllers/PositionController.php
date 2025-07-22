<?php

namespace App\Http\Controllers;

use App\Models\Positions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use App\Repositories\Contracts\PositionRepositoryInterface;

class PositionController extends Controller
{
    private $positionRepository;

    public function __construct(PositionRepositoryInterface $positionRepository)
    {
        $this->positionRepository = $positionRepository;
    }

    public function index()
    {
        $modal = $this->positionRepository->findWhere(['parentId' => null]);
        return response()->json($modal);
    }

    /**
     * Show the form for creating a new resource.
     *
     * @return \Illuminate\Http\Response
     */

    public function create(Request $request)
    {
        $request->validate([
            'name' => 'required|string',
            'parentId' => 'nullable|uuid|exists:positions,id',
        ]);

        $existingPosition = Positions::where('name', $request->name)->where('parentId', $request->parentId)->first();

        if ($existingPosition) {

            return response()->json([
                'messages' => ['Position name already exists.']
            ], 409);
        }

        return  response($this->positionRepository->create($request->all()), 201);
    }
    /**
     * Update the specified resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */
    public function update(Request $request, $id)
    {
        $request->validate([
            'name' => 'required|string',
            'parentId' => 'nullable|uuid|exists:categories,id',
        ]);

        $existingPosition = Positions::where('name', $request->name)->where('parentId', $request->parentId)->first();

        if ($existingPosition) {

            return response()->json([
                'messages' => ['Category name already exists.']
            ], 409);
        }
        
        return   response()->json($this->positionRepository->update($request->all(), $id), 200);
    }

    public function destroy($id)
    {
        $isDeleted = $this->positionRepository->deletePostion($id);
        if ($isDeleted == true) {
            return response()->json([], 200);
        } else {
            return response()->json([
                'message' => 'Category can not be deleted. Document is assign to this category.',
            ], 404);
        }
    }

    public function subcategories($id)
    {
        return response()->json($this->positionRepository->findWhere(['parentId' => $id]));
    }

    public function GetAllCategoriesForDropDown()
    {
        return response()->json($this->positionRepository->all());
    } 

}
