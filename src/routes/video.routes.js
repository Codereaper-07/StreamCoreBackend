import { Router } from "express";
import {
  publishVideo,
  updateVideo,
  deleteVideo,
  getVideoById,
  getAllVideos,
} from "../controllers/video.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { optionalVerifyJWT } from "../middlewares/optionalAuth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router
  .route("/")
  .get(getAllVideos)
  .post(
    verifyJWT,
    upload.fields([
      { name: "videoFile", maxCount: 1 },
      { name: "thumbnail", maxCount: 1 },
    ]),
    publishVideo
  );

router
  .route("/:videoId")
  .get(optionalVerifyJWT, getVideoById)
  .patch(
    verifyJWT,
    upload.fields([
      { name: "videoFile", maxCount: 1 },
      { name: "thumbnail", maxCount: 1 },
    ]),
    updateVideo
  )
  .delete(verifyJWT, deleteVideo);

export default router;
