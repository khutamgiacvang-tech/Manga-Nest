const mongoose = require("mongoose");

const followSchema = new mongoose.Schema({

    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    },

    manga:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Manga",
        required:true
    }

},{
    timestamps:true
});

module.exports =
mongoose.model("Follow",followSchema);