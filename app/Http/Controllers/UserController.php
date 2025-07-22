<?php

namespace App\Http\Controllers;

use App\Models\Users;
use App\Models\Positions;
use App\Models\Categories;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;
use App\Repositories\Contracts\UserRepositoryInterface;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;


class UserController extends Controller
{
    private $userRepository;

    public function __construct(UserRepositoryInterface $userRepository)
    {
        $this->userRepository = $userRepository;
    }

    public function index()
    {
        return response()->json($this->userRepository->all());
    }

    public function dropdown()
    {
        return response()->json($this->userRepository->getUsersForDropdown());
    }

    public function position(){
        $user_id = Auth::id();
        $user = Users::where('id',$user_id)->first();
        $pst = Positions::where('id',$user->positionId)->first();
        $dept = Categories::where('id',$user->categoryId)->first(); 
        return response()->json([
            'dept'=>$dept->name,
            'pst'=>$pst->name,
        ]);
    }
    /**
     * Show the form for creating a new resource.
     *
     * @return \Illuminate\Http\Response
     */

    public function create(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email'       => ['required', 'email', 'unique:' . (new Users())->getTable()],
            'firstName' =>   ['required'],
        ]);

        if ($validator->fails()) {
            return response()->json($validator->messages(), 409);
        }

        $request['password'] = Hash::make($request->password);
        return  response()->json($this->userRepository->createUser($request->all()), 201);
    }

    /**
     * Show the form for editing the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */
    public function edit($id)
    {
        return response()->json($this->userRepository->findUser($id));
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
        $request->except(['password']);
        $model = $this->userRepository->find($id);
        $model->firstName = $request->firstName;
        $model->lastName = $request->lastName;
        $model->phoneNumber = $request->phoneNumber;
        $model->userName = $request->userName;
        $model->categoryId = $request->categoryId;
        $model->positionId = $request->positionId;
        $model->rank = $request->rank;
        $model->email = $request->email;

        return  $this->userRepository->updateUser($model, $id, $request['roleIds']);
    }

    public function destroy($id)
    {
        $user = Users::findOrFail($id);
        $user->isDeleted = 1;
        $user->save();
        return response([], 204);
    }

    public function updateUserProfile(Request $request)
    {
        return  $this->userRepository->updateUserProfile($request);
    }

    public function submitResetPassword(Request $request)
    {
        $request->validate([
            'email' => 'required|email|exists:users',
            'password' => 'required'
        ]);

        $user = Users::where('email', $request->email)
            ->update(['password' => Hash::make($request->password)]);

        return  response()->json(($user), 204);
    }

    public function changePassword(Request $request)
    {
        $request->validate([
            'oldPassword' => 'required',
            'newPassword' => 'required',
        ]);

        if (!(Hash::check($request->get('oldPassword'), Auth::user()->password))) {
            return response()->json([
                'status' => 'Error',
                'message' => 'Old Password does not match!',
            ], 422);
        }

        Users::whereId(auth()->user()->id)->update([
            'password' => Hash::make($request->newPassword)
        ]);

        return response()->json([], 200);
    }

    public function forgotpassword(Request $request)
    {
        return $this->userRepository->forgotPassword($request);
    }

    public function getUserInfoForResetPassword($id)
    {
        return $this->userRepository->getUserInfoForResetPassword($id);
    }

    public function resetPassword(Request $request)
    {
        return $this->userRepository->resetPassword($request);
    }
        public function getUserRoles()
    {
        $userId = Auth::parseToken()->getPayload()->get('userId');
        
        $roles = DB::table('userRoles')
            ->join('roles', 'roles.id', '=', 'userRoles.roleId')
            ->where('userRoles.userId', '=', $userId)
            ->where('roles.isDeleted', '=', 0)
            ->pluck('roles.name')
            ->toArray();

        return response()->json(['roles' => $roles]);
    }

}
