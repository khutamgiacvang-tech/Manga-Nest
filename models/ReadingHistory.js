const mongoose = require("mongoose");

const readingHistorySchema = new mongoose.Schema({

    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    },

    manga:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Manga"
    },

    mangaTitle:String,

    mangaSlug:String,

    cover:String,

    chapterNumber:Number,

    progress:{
        type:Number,
        default:0
    },

    scrollPosition:{
        type:Number,
        default:0
    },

    updatedAt:{
        type:Date,
        default:Date.now
    }

});

module.exports =
    mongoose.model(
        "ReadingHistory",
        readingHistorySchema
    );