const express = require("express");
const router = express.Router();

const ReadingHistory =
    require("../models/ReadingHistory");
    router.post("/save", async (req,res)=>{

    if(!req.session.user){

        return res.json({
            success:false
        });

    }

    const {

        mangaId,
        mangaTitle,
        mangaSlug,
        cover,
        chapterNumber,
        progress,
        scrollPosition

    } = req.body;

    await ReadingHistory.findOneAndUpdate(

        {
            user:req.session.user._id,
            manga:mangaId
        },

        {
            manga:mangaId,
            mangaTitle,
            mangaSlug,
            cover,
            chapterNumber,
            progress,
            scrollPosition,
            updatedAt:new Date()
        },

        {
            upsert:true
        }

    );

    res.json({
        success:true
    });

});

router.get("/", async (req,res)=>{

    const histories =
        await ReadingHistory.find({

            user:req.session.user._id

        })

        .sort({
            updatedAt:-1
        });

    res.render(
        "history/index",
        {
            histories
        }
    );

});