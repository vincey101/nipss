<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ProcessDocuments implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $task;

    /**
     * Create a new job instance.
     */
    public function __construct($task)
    {
        $this->task = $task;
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        logger("Processing task: " . $this->task);

        $apiKey = 'AIzaSyDZhJbl3_njSZPRfEFVFI-jadbz5swrKtc';
        $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={$apiKey}";
        
        // Load and encode the image to base64
        $imagePath = $this->task; // Use PNG or JPG
        $imageData = file_get_contents($imagePath);;
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
                   and identify the most appropriate handling departments based on the responsibilities listed below.
        Governing Board
        Director General
        Sec/Director of Administration
        Director of Studies
        Director of Research
        Institute Bursar
        Head, Legal Services Unit
        Controller of Works
        Chief Security Officer
        Head, Abuja Office
        Head, NIPSS - OSKASOGS
        Head, ICT Unit
        COO Political Party & Leadership Dev. Centre
        Head, ACTU Unit
        Head, Centre for Studies (This appears multiple times in the chart)
        Head, Centre for Financial Studies
        Head, Final Acct
        Head, Exp. Control
        Head, Procurement & Statistics Dept.
        Head, Seminar & Publications Dept
        Head, General Admin Dept
        Head, Catering Services Dept
        Head, Accommodation Services
        Head, Medical & Health
        Head, Accounts Services
        Head, Participants Welfare
        Head, Participants Records
        Head, Central Store
        Head, Transport
        Head, Board Secretariat
        Head, SERVICOM
        Head, Internal Audit Unit
        Head, Public Affairs Dept.
        Head, Protocol
        Head, Technical
        Head, Institute Librarian
        Head, Reader
        Head, Staff Training & Dev. Unit
        Head, Registry Unit
        Head, Staff Pension & Welfare Unit
        Head, Human Resources Dept
        Head, Political Economics & Social Studies Dept
        Head, Science Technology & Innovation Studies Dept
        Head, Defence, Security & International Studies Dent (likely Dept)
        Head, Civil Engineering Unit
        Head, General Maintenance Unit
        Head, Parks & Garden Unit
        Head, SEC Dept
        Head, CD Dept
        Head, SC Dept
     nalyze the document image. Extract the text content and understand its meaning. Based strictly on the extracted content and the department descriptions provided above, determine the top 3 most relevant departments, and include the percentage probability. Return result in json file 


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
        
        // if (curl_errno($ch)) {
        //     echo 'Curl error: ' . curl_error($ch);
        // } else {
        //     $ff = json_decode($response, true);
          
          
        // }
        if (curl_errno($ch)) {
            logger("Curl Error on: " . curl_error($ch));
        } else {
            logger("Curl Successfrom: $response");
            // Optionally: store $response to DB
        }
        curl_close($ch);
        
        sleep(1); // simulate delay
    }
}
