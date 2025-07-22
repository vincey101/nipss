<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Repositories\Contracts\DocumentRepositoryInterface;
use App\Models\Documents;
use App\Models\User;
use App\Models\Categories;
use App\Models\Positions;
use App\Models\DocumentVersions;
use App\Models\FileRequestDocuments;
use App\Repositories\Contracts\ArchiveDocumentRepositoryInterface;
use App\Repositories\Contracts\DocumentMetaDataRepositoryInterface;
use App\Repositories\Contracts\DocumentShareableLinkRepositoryInterface;
use App\Repositories\Contracts\DocumentTokenRepositoryInterface;
use App\Repositories\Contracts\UserNotificationRepositoryInterface;
use App\Repositories\Contracts\CategoryRepositoryInterface;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;
use Ramsey\Uuid\Uuid;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class DocumentController extends Controller
{
    private $documentRepository;
    private  $documentMetaDataRepository;
    private $documenTokenRepository;
    private $userNotificationRepository;
    private $archiveDocumentRepository;
    private $documentShareableLinkRepository;
    private $categoryRepository;
    protected $queryString;

    public function __construct(
        DocumentRepositoryInterface $documentRepository,
        DocumentMetaDataRepositoryInterface $documentMetaDataRepository,
        UserNotificationRepositoryInterface $userNotificationRepository,
        DocumentTokenRepositoryInterface $documenTokenRepository,
        ArchiveDocumentRepositoryInterface $archiveDocumentRepository,
        DocumentShareableLinkRepositoryInterface $documentShareableLinkRepository,
        CategoryRepositoryInterface $categoryRepository
    ) {
        $this->documentRepository = $documentRepository;
        $this->documentMetaDataRepository = $documentMetaDataRepository;
        $this->userNotificationRepository = $userNotificationRepository;
        $this->documenTokenRepository = $documenTokenRepository;
        $this->archiveDocumentRepository = $archiveDocumentRepository;
        $this->documentShareableLinkRepository = $documentShareableLinkRepository;
        $this->categoryRepository = $categoryRepository;
    }

    public function getDocuments(Request $request)
    {
        $queryString = (object) $request->all();

        $count = $this->documentRepository->getDocumentsCount($queryString);
        return response()->json($this->documentRepository->getDocuments($queryString))
            ->withHeaders(['totalCount' => $count, 'pageSize' => $queryString->pageSize, 'skip' => $queryString->skip]);
    }

    public function officeviewer(Request $request, $id)
    {
        $documentToken = $this->documenTokenRepository->getDocumentPathByToken($id, $request);

        if ($documentToken == null) {
            return response()->json([
                'message' => 'Document Not Found.',
            ], 404);
        }

        $isPublic = filter_var($request->input('isPublic'), FILTER_VALIDATE_BOOLEAN);
        $isFileRequest = filter_var($request->input('isFileRequest'), FILTER_VALIDATE_BOOLEAN);

        if ($isPublic == true) {
            return $this->downloadSharedDocument($request, $id);
        } else if ($isFileRequest == true) {
            return $this->downloadFileRequestDocument($id);
        } else {
            return $this->downloadDocument($id, $request->input('isVersion'));
        }
    }

    public function downloadSharedDocument(Request $request, $id)
    {
        $password = '';

        if ($request->has('password')) {
            $password = $request->input('password');
        }
        $documentSharableLink = $this->documentShareableLinkRepository->getByCode($id);
        if ($documentSharableLink == null) {
            return response()->json(['error' => ['message' => 'Link Expired.']], 404);
        }
        if (!empty($documentSharableLink->password) && base64_decode($documentSharableLink->password) != $password) {
            return response()->json(['error' => ['message' => 'Password is incorrect']], 404);
        }
        return $this->downloadDocument($documentSharableLink->documentId, false);
    }

    public function downloadDocument($id, $isVersion)
    {
        $bool = filter_var($isVersion, FILTER_VALIDATE_BOOLEAN);
        if ($bool == true) {
            $file = DocumentVersions::withoutGlobalScope('isDeleted')->withTrashed()->findOrFail($id);
        } else {
            $file = Documents::withoutGlobalScope('isDeleted')->withTrashed()->findOrFail($id);
        }

        $fileupload = $file->url;
        $location = $file->location ?? 'local';

        try {
            if (Storage::disk($location)->exists($fileupload)) {
                $file_contents = Storage::disk($location)->get($fileupload);
                $fileType = Storage::mimeType($fileupload);

                $fileExtension = explode('.', $file->url);

                return response($file_contents)
                    ->header('Cache-Control', 'no-cache private')
                    ->header('Content-Description', 'File Transfer')
                    ->header('Content-Type', $fileType)
                    ->header('Content-length', strlen($file_contents))
                    ->header('Content-Disposition', 'attachment; filename=' . $file->name . '.' . $fileExtension[1])
                    ->header('Content-Transfer-Encoding', 'binary');
            }
        } catch (\Throwable $th) {
            throw $th;
        }
    }

    public function readSharedTextDocument(Request $request, $id)
    {
        $documentSharableLink = $this->documentShareableLinkRepository->getByCode($id);
        if ($documentSharableLink == null) {
            return response()->json(['error' => ['message' => 'Link Expired.']], 404);
        }
        if (!empty($documentSharableLink->password) && base64_decode($documentSharableLink->password) != $request['password']) {
            return response()->json(['error' => ['message' => 'Password is incorrect']], 404);
        }
        return $this->readTextDocument($documentSharableLink->documentId, false);
    }

    public function readTextDocument($id, $isVersion)
    {
        $bool = filter_var($isVersion, FILTER_VALIDATE_BOOLEAN);
        if ($bool == true) {
            $file = DocumentVersions::withoutGlobalScope('isDeleted')->withTrashed()->findOrFail($id);
        } else {
            $file = Documents::withoutGlobalScope('isDeleted')->withTrashed()->findOrFail($id);
        }

        $fileupload = $file->url;
        $location = $file->location ?? 'local';

        if (Storage::disk($location)->exists($fileupload)) {
            $file_contents = Storage::disk($location)->get($fileupload);
            $response = ["result" => [$file_contents]];
            return response($response);
        }
    }

      public function saveDocument(Request $request)
    {
        // try {
            $aiId = null;
            // $model = Documents::where([
            //     ['name', '=', $request->name],
            //     ['categoryId', '=', $request->categoryId]
            // ])->first();

            // if (!is_null($model)) {
            //     return response()->json([
            //         'message' => 'Document already exist with same name with same category.',
            //     ], 409);
            // }

            $validator = Validator::make($request->all(), [
                'name'       => ['required'],
                'uploadFile' => ['required', 'file'],
                'categoryId' => ['required'],
            ]);

            if ($validator->fails()) {
                return response()->json($validator->messages(), 409);
            }

            if (!$request->hasFile('uploadFile') || !$request->file('uploadFile')->isValid()) {
                return response()->json([
                    'message' => 'Error: Invalid or missing file upload',
                ], 409);
            }

            $location = $request->location ?? 'local';
            $fileSize = $request->file('uploadFile')->getSize();

            // Check S3 configuration if using S3
            if ($location == 's3') {
                $s3Key = config('filesystems.disks.s3.key');
                $s3Secret = config('filesystems.disks.s3.secret');
                $s3Region = config('filesystems.disks.s3.region');
                $s3Bucket = config('filesystems.disks.s3.bucket');

                if (empty($s3Key) || empty($s3Secret) || empty($s3Region) || empty($s3Bucket)) {
                    return response()->json([
                        'message' => 'Error: S3 configuration is missing',
                    ], 409);
                }
            }

            // Store the file
            try {
                $path = $request->file('uploadFile')->storeAs(
                    'documents',
                    Uuid::uuid4() . '.' . $request->file('uploadFile')->getClientOriginalExtension(),
                    $location
                );

                if (empty($path)) {
                    throw new \Exception('Failed to store file');
                }
            } catch (\Exception $e) {
                return response()->json([
                    'message' => 'Error in storing document in ' . $location,
                ], 409);
            }

            // Check if document should be auto-assigned using AI
            if ($request->auto_assign == "true") {
                    // Use Gemini AI to analyze document and suggest department
                    $get_automated_dept = $this->automate_dept($path);
                    if (!empty($get_automated_dept)) {
                        // Map department name to position ID
                        $get_pst = Positions::where('name', $get_automated_dept)->first();
                         $aiId = $get_pst ? $get_pst->id : null;
    
                    
                    }

            }

            

            // Save the document
            return $this->documentRepository->saveDocument($request, $path, $fileSize, $aiId);

           

        // } catch (\Exception $e) {
        //     Log::error('Document save error: ' . $e->getMessage());
        //     return response()->json([
        //         'message' => 'Error in saving document: ' . $e->getMessage(),
        //     ], 409);
        // }
    }

    // public function saveDocument(Request $request)
    // {
    
    //     $aiId = null;
    //     $model = Documents::where([
    //         ['name', '=', $request->name],
    //         ['categoryId', '=', $request->categoryId]
    //     ])->first();


    //     if (!is_null($model)) {
    //         return response()->json([
    //             'message' => 'Document already exist with same name with same category.',
    //         ], 409);
    //     }

    //     $validator = Validator::make($request->all(), [
    //         'name'       => ['required'],
    //     ]);

    //     if ($validator->fails()) {
    //         return response()->json($validator->messages(), 409);
    //     }

    //     if (!$request->file('uploadFile')->isValid()) {
    //         return response()->json([
    //             'message' => 'Error: ' . $request->file('uploadFile')->getErrorMessage(),
    //         ], 409);
    //     }

    //     $location = $request->location ?? 'local';
    //     $fileSize = $request->file('uploadFile')->getSize();

    //     try {

    //         if ($location == 's3') {
    //             $s3Key = config('filesystems.disks.s3.key');
    //             $s3Secret = config('filesystems.disks.s3.secret');
    //             $s3Region = config('filesystems.disks.s3.region');
    //             $s3Bucket = config('filesystems.disks.s3.bucket');

    //             if (empty($s3Key) || empty($s3Secret) || empty($s3Region) || empty($s3Bucket)) {
    //                 return response()->json([
    //                     'message' => 'Error: S3 configuration is missing',
    //                 ], 409);
    //             }
    //         }

    //         $path = $request->file('uploadFile')->storeAs(
    //             'documents',
    //             Uuid::uuid4() . '.' . $request->file('uploadFile')->getClientOriginalExtension(),
    //             $location
    //         );
    //         if ($path == null || $path == '') {
    //             return response()->json([
    //                 'message' => 'Error in storing document in ' . $location,
    //             ], 409);
    //         }

    //     if(!empty($request->auto_assign)){
    //         $get_automated_dept = $this->automate_dept($path);
    //         $get_pst = Positions::where('name',$get_automated_dept)->first();
    //         if(!empty($get_pst)){
    //          $aiId = $get_pst->id;
    //         }
    //         else{
    //         $aiId = null;
    //         } 
    //     }
        
       
    //     } catch (\Throwable $th) {
    //         return response()->json([
    //             'message' => 'Error in storing document in ' . $location,
    //         ], 409);
    //     }
    //     return $this->documentRepository->saveDocument($request, $path, $fileSize, $aiId);
    // }

    public function updateDocument(Request $request, $id)
    {
        $model = Documents::where([['name', '=', $request->name], ['categoryId', '=', $request->categoryId], ['id', '<>', $id]])->first();

        if (!is_null($model)) {
            return response()->json([
                'message' => 'Document already exist.',
            ], 409);
        }
        return  response()->json($this->documentRepository->updateDocument($request, $id), 200);
    }

    public function archiveDocument($id)
    {
        return $this->documentRepository->archiveDocument($id);
    }

    public function deleteDocument($id)
    {
        return $this->archiveDocumentRepository->deleteDocument($id);
    }

    public function getDocumentMetatags($id)
    {
        return  response($this->documentMetaDataRepository->getDocumentMetadatas($id), 200);
    }

    public function assignedDocuments(Request $request)
    {
        $queryString = (object) $request->all();

        $count = $this->documentRepository->assignedDocumentsCount($queryString);
        return response()->json($this->documentRepository->assignedDocuments($queryString))
            ->withHeaders(['totalCount' => $count, 'pageSize' => $queryString->pageSize, 'skip' => $queryString->skip]);
    }

    public function getDocumentsByCategoryQuery()
    {
        return response()->json($this->documentRepository->getDocumentByCategory());
    }

    public function getDocumentbyId($id)
    {
        return response()->json($this->documentRepository->getDocumentbyId($id));
    }

    public function getDeepSearchDocuments(Request $request)
    {
        $queryString = (object) $request->all();
        return response()->json($this->documentRepository->getDeepSearchDocuments($queryString));
    }

    public function addDOocumentToDeepSearch($id)
    {
        return response()->json($this->documentRepository->addDOocumentToDeepSearch($id));
    }

    public function removeDocumentFromDeepSearch($id)
    {
        return response()->json($this->documentRepository->removeDocumentFromDeepSearch($id));
    }

    public function downloadFileRequestDocument($id)
    {
        $file = FileRequestDocuments::findOrFail($id);

        $fileupload = $file->url;
        $location = 'local';

        try {
            if (Storage::disk($location)->exists($fileupload)) {
                $file_contents = Storage::disk($location)->get($fileupload);
                $fileType = Storage::mimeType($fileupload);

                $fileExtension = explode('.', $file->url);

                return response($file_contents)
                    ->header('Cache-Control', 'no-cache private')
                    ->header('Content-Description', 'File Transfer')
                    ->header('Content-Type', $fileType)
                    ->header('Content-length', strlen($file_contents))
                    ->header('Content-Disposition', 'attachment; filename=' . $file->name . '.' . $fileExtension[1])
                    ->header('Content-Transfer-Encoding', 'binary');
            }
        } catch (\Throwable $th) {
            throw $th;
        }
    }

    public function automate_dept($file){
        $my_position = Positions::all();
        $pst  = [];
        foreach ($my_position as $dept) {
           $pst[] = $dept->name;
        }

        $apiKey = 'AIzaSyDZhJbl3_njSZPRfEFVFI-jadbz5swrKtc';
        $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={$apiKey}";
        
        // Load and encode the image to base64
        $imageData = Storage::get($file);;
        $base64Image = base64_encode($imageData);
        
        // Prepare the request payload
        $data = [
            "contents" => [
                [
                    "parts" => [
                        [
                            "inlineData" => [
                                "mimeType" => "image/png", // or "image/jpeg"
                                "data" => $base64Image
                            ]
                        ],
                        [
        "text" => "You are an AI assistant tasked with automatically routing incoming documents to the correct department 
                   within our organization. Your goal is to extract and analyze the content of the provided document image 
                   and identify the most appropriate handling departments based on the responsibilities listed below.". json_encode($pst).
       
     "analyze the document image. Extract the text content and understand its meaning. Based strictly on the extracted content and the department descriptions provided above, determine the top 3 most relevant departments, and include the percentage probability. Return result in json file 


Prioritize accuracy in classification. If the content extracted from the image is clearly relevant to fewer than 3 departments, return only the relevant ones.
        .
        "
                        ]
                    ]
                ]
            ]
        ];
        
        // Initialize cURL
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json'
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        
        // Execute and capture response
        $response = curl_exec($ch);
        if (curl_errno($ch)) {
         echo "Curl Error on: $response";
        } else {
            $data = json_decode($response, true);
            // Extract the response text
            $text = $data['candidates'][0]['content']['parts'][0]['text'];
            $cleaned = trim($text, "` \njson");
            $data = json_decode($cleaned, true);
            if (json_last_error() === JSON_ERROR_NONE && isset($data[0]['department'])) {
                $firstDepartment = $data[0]['department'];
                return $firstDepartment;
            } else {
                echo "Failed to decode or access department.";
            }
           
        }
        curl_close($ch);
    }


    // public function mediaLibary(Request $request){
    //         $validator = Validator::make($request->all(), [
    //                 'uploadFile' => ['required', 'file'],
    //             ]);

    //             if ($validator->fails()) {
    //                 return response()->json($validator->messages(), 409);
    //             }

    //             if (!$request->hasFile('uploadFile') || !$request->file('uploadFile')->isValid()) {
    //                 return response()->json([
    //                     'message' => 'Error: Invalid or missing file upload',
    //                 ], 409);
    //             }

    //             $location = $request->location ?? 'local';
    //             $fileSize = $request->file('uploadFile')->getSize();

    //             // Check S3 configuration if using S3
    //             if ($location == 's3') {
    //                 $s3Key = config('filesystems.disks.s3.key');
    //                 $s3Secret = config('filesystems.disks.s3.secret');
    //                 $s3Region = config('filesystems.disks.s3.region');
    //                 $s3Bucket = config('filesystems.disks.s3.bucket');

    //                 if (empty($s3Key) || empty($s3Secret) || empty($s3Region) || empty($s3Bucket)) {
    //                     return response()->json([
    //                         'message' => 'Error: S3 configuration is missing',
    //                     ], 409);
    //                 }
    //             }

    //             // Store the file
    //             try {
    //                 $path = $request->file('uploadFile')->storeAs(
    //                     'documents',
    //                     Uuid::uuid4() . '.' . $request->file('uploadFile')->getClientOriginalExtension(),
    //                     $location
    //                 );
    //                 $userId = Auth::parseToken()->getPayload()->get('userId');
    //                 DB::table('medialibary')->insert([
    //                     'file'=>$path,
    //                     'user_id' =>$userId  
    //                 ]);

    //                 if (empty($path)) {
    //                     throw new \Exception('Failed to store file');
    //                 }
    //             } catch (\Exception $e) {
    //                 return response()->json([
    //                     'message' => 'Error in storing document in ' . $location,
    //                 ], 409);
    //             }
    //         return response()->json([
    //                         'message' => 'Image Uploaded Successfully',
    //                     ], 200);    
    //     }


    // public function getmediaLibary(){
    // $userId = Auth::parseToken()->getPayload()->get('userId'); 
    // $mediaData =  DB::table('medialibary')->where('user_id', $userId)->get();
    // return response()->json([
    //                     'data' => $mediaData,
    //                 ], 200);    
    // }

    // public function deletemediaLibary($id){
    //     $userId = Auth::parseToken()->getPayload()->get('userId');
    //     DB::table('medialibary')->where('id', $id)->where('user_id', $userId)->delete();
    //      return response()->json([
    //                     'message' => 'Image Deleted Successfully',
    //                 ], 200);  
    // }

    public function mediaLibary(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'signature' => 'required|file|mimes:jpeg,png,jpg,gif|max:2048',
        ]);

        if ($validator->fails()) {
            return response()->json($validator->messages(), 409);
        }

        try {
            $userId = Auth::parseToken()->getPayload()->get('userId');
            $file = $request->file('signature');
            
            // Generate unique filename
            $filename = Uuid::uuid4() . '.' . $file->getClientOriginalExtension();
            
            // Store file in public disk
            $path = $file->storeAs('signatures', $filename, 'public');
            
            // Get the full URL for the stored file - use url() helper for proper domain
            $url = url('storage/' . $path);
            
            // Save to database
            $signatureId = DB::table('signatures')->insertGetId([
                'name' => $request->name,
                'url' => $url, // Store the full URL
                'user_id' => $userId,
                'created_at' => now(),
                'updated_at' => now()
            ]);

            // Get the signature data for immediate use
            $signatureData = null;
            if (Storage::disk('public')->exists($path)) {
                $fileContents = Storage::disk('public')->get($path);
                $base64 = base64_encode($fileContents);
                $mimeType = mime_content_type(storage_path('app/public/' . $path));
                $signatureData = "data:{$mimeType};base64,{$base64}";
            }

            return response()->json([
                'message' => 'Signature saved successfully',
                'id' => $signatureId,
                'name' => $request->name,
                'url' => $url,
                'signatureData' => $signatureData,
                'createdAt' => now(),
                'updatedAt' => now()
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Error saving signature: ' . $e->getMessage()
            ], 500);
        }
    }

    public function getmediaLibary()
    {
        try {
            $userId = Auth::parseToken()->getPayload()->get('userId');
            
            $signatures = DB::table('signatures')
                ->where('user_id', $userId)
                ->get()
                ->map(function ($signature) {
                    // Extract the path from the URL
                    $urlParts = parse_url($signature->url);
                    $pathParts = explode('/storage/', $urlParts['path']);
                    $relativePath = end($pathParts);

                    // Check if file exists
                    if (Storage::disk('public')->exists($relativePath)) {
                        // Get the file contents and encode as base64
                        $fileContents = Storage::disk('public')->get($relativePath);
                        $base64 = base64_encode($fileContents);
                        
                        // Get mime type using PHP's built-in function
                        $fullPath = storage_path('app/public/' . $relativePath);
                        $mimeType = mime_content_type($fullPath);
                        
                        return [
                            'id' => $signature->id,
                            'name' => $signature->name,
                            'url' => $signature->url,
                            'signatureData' => "data:{$mimeType};base64,{$base64}",
                            'createdAt' => $signature->created_at,
                            'updatedAt' => $signature->updated_at
                        ];
                    }
                    
                    // Return basic info if file not found
                    return [
                        'id' => $signature->id,
                        'name' => $signature->name,
                        'url' => $signature->url,
                        'error' => 'Signature file not found',
                        'createdAt' => $signature->created_at,
                        'updatedAt' => $signature->updated_at
                    ];
                });

            return response()->json($signatures, 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Error retrieving signatures: ' . $e->getMessage()
            ], 500);
        }
    }

    public function deletemediaLibary($id)
    {
        try {
            $userId = Auth::parseToken()->getPayload()->get('userId');
            
            // Get signature details
            $signature = DB::table('signatures')
                ->where('id', $id)
                ->where('user_id', $userId)
                ->first();

            if (!$signature) {
                return response()->json([
                    'message' => 'Signature not found'
                ], 404);
            }

            // Extract the path from the URL
            // The URL will be something like http://localhost/storage/signatures/filename.jpg
            // Extract 'signatures/filename.jpg'
            $urlParts = parse_url($signature->url);
            $pathParts = explode('/storage/', $urlParts['path']);
            $relativePath = end($pathParts);
            
            // Delete file from storage
            if (Storage::disk('public')->exists($relativePath)) {
                Storage::disk('public')->delete($relativePath);
            }

            // Delete from database
            $deleted = DB::table('signatures')
                ->where('id', $id)
                ->where('user_id', $userId)
                ->delete();

            return response()->json([
                'message' => 'Signature deleted successfully',
                'deleted' => $deleted
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Error deleting signature: ' . $e->getMessage()
            ], 500);
        }
    }
}
