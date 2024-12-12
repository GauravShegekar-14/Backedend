import {asyncHandler} from "../utils/asyncHandler.js"
import {APiError} from "../utils/APiError.js"
import jwt from "jsonwebtoken"
import {User} from "../models/user.model.js"

export const varifyJWT = asyncHandler(async(req, _, next)=>{
   try {
      const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "")
      console.log(token);
      
   
      if(!token){
       throw new APiError(401, "Unauthorized request")
      }
   
      const decodeToken = jwt.verify(token, process.env.ACCESS_TOKES_SECRET)
   
     const user =  await User.findById(decodeToken?._id).select("-password -refreshToken")
   
     if(!user){
      throw new APiError(401, "Invalid Access Token")
     }
   
     req.user = user;
     next();
     
   } catch (error) {
      throw new APiError(401, error?.message || "Invalid Access Token")
   }
})