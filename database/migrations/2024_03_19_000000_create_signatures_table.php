<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateSignaturesTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::dropIfExists('signatures');
        
        Schema::create('signatures', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('url');
            $table->string('user_id', 36); // Changed to string type with length 36 for UUID
            $table->timestamps();
            
            // Add index on user_id
            $table->index('user_id');
            
            // Add foreign key without type constraints
            $table->foreign('user_id')
                  ->references('id')
                  ->on('users')
                  ->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('signatures');
    }
} 