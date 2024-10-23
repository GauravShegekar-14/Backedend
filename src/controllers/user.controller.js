import {asyncHandler} from "../utils/asyncHandler.js"
import {APiError} from "../utils/APiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import {APiResponse} from "../utils/APiResponse.js"


const registerUser = asyncHandler(async (req,res) => {
  //get user details from frontend
  const {username,email,fullName,password} = req.body
  //  console.log("username: ",username)
  //  console.log("email: ",email)
  //  console.log("fullname: ",fullName)
  //  console.log("password: ",password)
   
  //validation - not empty
   if(
    [fullName,email,username,password].some((field) =>field?.trim() ==="")
   ){
    throw new APiError(400,"All fields are required");
   }

  //check if user already exist : username , email
   const existedUser = await User.findOne({
      $or:[{username}, {email}]
    })

    if(existedUser) {
      throw new APiError(409,"User with Username or email already exist")
    }

  //chech for images , check for avatar  
  const avatarLocalPath = req.files?.avatar[0]?.path;
  let coverImageLocalPath;
  if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
       coverImageLocalPath = req.files.coverImage[0].path
  } 
  
 if(!avatarLocalPath){
  throw new APiError(400,"Avatar file is required")
  
}
  //upload them to cloudinary:avatar
  const avatar = await uploadOnCloudinary(avatarLocalPath)
  const coverImage = await uploadOnCloudinary(coverImageLocalPath)

  // console.log(avatar);
  
 if(!avatar){
  throw new APiError(400,"Avatar file is required")
 }

 

  //create user object - create entry in db
  const user = await User.create({
    fullName,
    avatar:avatar.url,
    coverImage:coverImage?.url || "",
    email,
    password,
    username:username.toLowerCase()
   })

   // remove password and refresh token field from response
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  )
  
  //chech for user creation
  if(!createdUser){
       throw new APiError(500,"Something went wrong while registring the user")
  }

  //return response
 return res.status(201).json(
  new APiResponse(200, createdUser, "User registered successfully")
 )

})

export {registerUser}