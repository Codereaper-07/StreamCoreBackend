import { Router } from "express";
import {
  subscribeChannel,
  unsubscribeChannel,
} from "../controllers/subscription.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

router
  .route("/c/:channelId")
  .post(subscribeChannel)
  .delete(unsubscribeChannel);

export default router;
