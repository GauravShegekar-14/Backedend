import {asyncHandler} from "../utils/asyncHandler.js"
import {APiError} from "../utils/APiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import {APiResponse} from "../utils/APiResponse.js"
import jwt from "jsonwebtoken"

const generateAccessAndRefreshTokens = async(userId)=>{
  try {
   const user = await User.findById(userId)
  const accessToken= user.generateAccessToken()
  const refreshToken =  user.generateRefreshToken()
   
  user.refreshToken = refreshToken
  await user.save({validateBeforeSave:false})

  return {accessToken,refreshToken}

  } catch (error) {
    throw new APiError(500,"something went wrong while generating refresh and access token")
  }
}

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
  console.log(avatarLocalPath);
  
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

  console.log(avatar);
  
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



const loginUser = asyncHandler(async(req,res)=>{
   //req body => data
   const {email,username,password} = req.body
   if (!username && !email) {
    throw new APiError(400,"username or email is require")
   }
   
   // username,email
   const user = await User.findOne({
    $or:[{username},{email}]
   })

   // find the user
   if (!user) {
    throw new APiError(404,"user does not exist")
   }

   // password check
  const isPasswordValid = await user.isPasswordCorrect(password)
  if (!isPasswordValid) {
    throw new APiError(401,"invalid user credentials")
   }

   //access and refresh token
   const {accessToken,refreshToken} = await generateAccessAndRefreshTokens(user._id)

   //send cookie  
   const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

   const options = {
    httpOnly: true,
    secure: true
}
   return res.status(200)
   .cookie("accessToken", accessToken, options)
   .cookie("refreshToken", refreshToken, options)
    .json(
    new APiResponse(
      200,
      {
        user: loggedInUser,
        accessToken,
        refreshToken
      },
      "User logged in successfully"
    )
  );
})


const logoutUser = asyncHandler(async(req,res)=>{
    User.findByIdAndUpdate(
      req.user._id,
      {
        $set:{
          refreshToken:undefined
        }
      },
      {
        new:true
      }
    )

    const options = {
      httpOnly : true,
      secure: true
     }
     return res.status(200).clearCookie("accessToken",options)
     .clearCookie("refreshToken", options)
     .json(new APiResponse(200, {},"user logged out"))
     
})

const refreshAccessToken = asyncHandler(async(req,res)=>{

 const incommingRefreshtoken = req.cookies.refreshToken || req.body.refreshToken

 if(!incommingRefreshtoken){
  throw new APiError(401, "unauthorized request")
 }

  try {
    const decodedToken =  jwt.verify(
    incommingRefreshtoken,
    process.env.REFRESH_TOKEN_SECRETE
   )
  
   const user = await User.findById(decodedToken?._id)
  
   if(!user){
    throw new APiError(401, "Invalid refresh token")
   }
  
   if(incommingRefreshtoken !== user?.refreshToken){
    throw new APiError(401, "refresh token is expired or used")
   }
  
   const options = {
    httpOnly :true,
    secure:true
   }
  
  const {accessToken,newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
  
   return res
   .status(200)
   .cookie("accessToken",accessToken,options)
   .cookie("refreshToken",newRefreshToken,options)
   .json(
    new APiResponse(
      200,
      {accessToken,refreshToken:newRefreshToken},
      "Access token refreshed"
    )
   )
  } catch (error) {
    throw new APiError(401,error?.message || "Invalid refresh token") 
  }
 
})

const changeCurrentPassowrd = asyncHandler(async(req,res)=>{
    const {oldPassword,newPassword,confPassword} = req.body


   const user = await User.findById(req.user?._id)

   const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

   if(!isPasswordCorrect){
    throw new APiError(400, "Invalid Old password")

   }

   user.password = newPassword
   await user.save({validateBeforeSave:false})

   return res.status(200).json(new APiResponse(200,{},"password changed succesfully"))
})


const getCurrentUser = asyncHandler(async(req,res) =>{
  return res.status(200).json(200,req.user,"Current user fetched successfully")
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
  const {fullName,email} = req.body
  
  if(!fullName || !email){
    throw new APiError(400,"all fields are required")
  }

 const user =  User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        fullName:fullName,
        email:email
      }
    },
    {new:true}
  ).select("-password")

  return res
  .status(200)
  .json(new APiResponse(200,user,"Account details Updated successfully"))
})

const updateUserAvatar = asyncHandler(async(req,res)=>{
 const avatarLocalPath =  req.file?.path

 if (!avatarLocalPath) {
    throw new APiError(400,"Avatar file is missing")
 }

const avatar =  await uploadOnCloudinary(avatarLocalPath)

if (!avatar.url) {
   throw new APiError(400,"Error white uploading on avatar")
}

const user = await User.findByIdAndUpdate(
  req.user?._id,
  {
    $set:{
      avatar:avatar.url
    }
  },
  {new :true}
).select("-password")

return res.status(200).json(new APiResponse(200,user,"Avatar image updated successfully"))
})

const updateUserCoverimg = asyncHandler(async(req,res)=>{
  const coverLocalPath =  req.file?.path
 
  if (!coverLocalPath) {
     throw new APiError(400,"cover Img file is missing")
  }
 
 const cover =  await uploadOnCloudinary(coverLocalPath)
 
 if (!cover.url) {
    throw new APiError(400,"Error white uploading on cover img")
 }
 
    const user = await User.findByIdAndUpdate(
   req.user?._id,
   {
     $set:{
       cover:cover.url
     }
   },
   {new :true}
 ).select("-password")
 
 return res.status(200).json(new APiResponse(200,user,"cover image updated successfully"))
 })
 
export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassowrd,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverimg
}