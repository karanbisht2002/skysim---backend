'use strict';

import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import { storage } from '../storage';
import { asyncHandler } from '../lib/asyncHandler';
import { ValidationError, NotFoundError } from '../lib/errors';
import { logger } from '../lib/logger';
import { sendEmail, generateOTPEmail, generateWelcomeEmail } from '../email';
import { generateToken } from 'server/utils/auth';
import { requireAuth, requireAdmin } from 'server/middleware/auth';
import * as ApiResponse from '../utils/response';
import admin, { initFirebaseAdmin } from "../config/firebase-admin";

const router = Router();
const BCRYPT_ROUNDS = 12;

function generateOTP(): string {
  if (process.env.NODE_ENV === 'development') {
    return '123456';
  }
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
}

router.post('/send-otp', async (req: Request, res: Response) => {
  try {
    const { email, purpose = 'login' } = req.body;
    if (!email) {
      return ApiResponse.badRequest(res, 'api.auth.emailRequired');
    }


    let user = await storage.getUserByEmail(email);

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      if (user && user.isDeleted) {
        return ApiResponse.badRequest(
          res,
          'api.auth.accountDeleted'
        );
      }

    await storage.createOTP({ email, code, expiresAt, verified: false, purpose });
    console.log(
      `Generated OTP for ${email}: ${code} (purpose: ${purpose}, expires at ${expiresAt.toISOString()})`,
    );

    const emailContent = await generateOTPEmail(code);
    await sendEmail({
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    return ApiResponse.success(res, 'api.auth.otpSent', { email, code });
  } catch (error: any) {
    console.error('Send OTP error:', error);
    return ApiResponse.serverError(res, error.message);
  }
});

router.post('/app/send-otp', async (req: Request, res: Response) => {
  try {
    const { email, purpose = 'login' } = req.body;

    if (!email) {
      return ApiResponse.badRequest(res, 'api.auth.emailRequired');
    }

    /* ---------------------------------
       CHECK USER EXISTS
    ---------------------------------- */
    const existingUser = await storage.getUserByEmail(email);


    if (existingUser && existingUser.isDeleted) {
  return ApiResponse.badRequest(
    res,
    'api.auth.accountDeleted'
  );
}

    // ✅ User exists AND password is already set → DO NOT send OTP
    if (existingUser?.hashedPassword != null) {
      return ApiResponse.success(res, 'api.auth.passwordAlreadySet', {
        email,
        is_password_set: true,
      });
    }

    /* ---------------------------------
       PASSWORD NOT SET → SEND OTP
    ---------------------------------- */
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    console.log('🔥 BEFORE CREATE OTP');

    const otpRecord = await storage.createOTP({
      email,
      code,
      expiresAt,
      verified: false,
      purpose,
    });

    console.log('🔥 AFTER CREATE OTP', otpRecord);

    console.log(
      `Generated OTP for ${email}: ${code} (purpose: ${purpose}, expires at ${expiresAt.toISOString()})`,
    );

    const emailContent = await generateOTPEmail(code);

    await sendEmail({
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    return ApiResponse.success(res, 'api.auth.otpSent', {
      email,
      is_password_set: false,
      code
    });
  } catch (error: any) {
    console.error('Send OTP error:', error);
    return ApiResponse.serverError(res, error.message);
  }
});

router.post('/app/verify-otp', async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (!email) {
      return ApiResponse.badRequest(res, 'api.auth.emailRequired');
    }

    if (!otp) {
      return ApiResponse.badRequest(res, 'api.auth.otpRequired');
    }

    const isValid = await storage.verifyOTP(email, otp);

    if (!isValid) {
      // ❌ OTP invalid or expired
      return ApiResponse.success(res, 'api.auth.invalidOtp', {
        success: false,
      });
    }

    let user = await storage.getUserByEmail(email);

    if (!user) {
      user = await storage.createUser({
        email,
        kycStatus: 'pending',
      });
    }

    // ✅ OTP matched
    return ApiResponse.success(res, 'api.auth.otpVerified', {
      success: true,
      userId: user?.id,
    });
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const {
      email,
      otp,
      isFromGoogle = false,
      fcmToken,
      imagePath,
      deviceid,
      deviceType,
      deviceModel,
      appVersion,
      deviceManufacturer,
      deviceLocation,
      name,
    } = req.body;

    if (!email) {
      return ApiResponse.badRequest(res, 'api.auth.emailRequired');
    }

    if (!isFromGoogle) {
      if (!otp) {
        return ApiResponse.badRequest(res, 'api.auth.otpRequired');
      }

      const isValid = await storage.verifyOTP(email, otp);
      if (!isValid) {
        return ApiResponse.badRequest(res, 'api.auth.invalidOtp');
      }
    }

    let user = await storage.getUserByEmail(email);

    if (!user) {
      user = await storage.createUser({
        email,
        name: name ?? null,
        imagePath: imagePath ?? null,
        isFromGoogle,
        kycStatus: 'pending',
      });

      const welcomeEmail = await generateWelcomeEmail(user.name || 'Traveler', email);
      await sendEmail({
        to: email,
        subject: welcomeEmail.subject,
        html: welcomeEmail.html,
      });

      await storage.createNotification({
        userId: user.id,
        type: 'welcome',
        title: 'Welcome message coming up as esim global!',
        message: 'Thank you for joining us. Start browsing destinations to get your first eSIM.',
        read: false,
      });
    } else {
      // ✅ NEW CHECK — isBlocked & isDeleted
      if (user.isBlocked && !user.isDeleted) {
        return ApiResponse.badRequest(
          res,
          'api.auth.accountBlocked'
        );
      }

      if (user.isDeleted) {
        return ApiResponse.badRequest(
          res,
          'api.auth.accountDeleted'
        );
      }

      await storage.updateUser(user.id, {
        ...(name && { name }),
        ...(imagePath && { imagePath }),
        ...(fcmToken && { fcmToken }),
        ...(deviceid && { deviceid }),
        ...(deviceType && { deviceType }),
        ...(deviceModel && { deviceModel }),
        ...(appVersion && { appVersion }),
        ...(deviceManufacturer && { deviceManufacturer }),
        ...(deviceLocation && { deviceLocation }),
        ...(typeof isFromGoogle === 'boolean' && { isFromGoogle }),
      });
    }

    req.session.userId = user.id;
    // console.log("User logged in or registered with ID:", user.id, req.session.userId);
    const token = generateToken(user);

    return ApiResponse.success(res, 'api.auth.loginSuccessful', {
      id: user.id,
      email: user.email,
      name: user.name,
      token,
      passwordSet: !!user.hashedPassword,
    });
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.post('/check-email', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return ApiResponse.badRequest(res, 'api.auth.emailRequired');
    }

    const user = await storage.getUserByEmail(email);

    return ApiResponse.success(res, 'api.auth.emailCheckCompleted', {
      exists: !!user,
      passwordSet: user ? !!user.hashedPassword : false,
    });
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.post('/login-password', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return ApiResponse.badRequest(res, 'api.auth.emailAndPasswordRequired');
    }

    const user = await storage.getUserByEmail(email);

    if (!user) {
      return ApiResponse.badRequest(res, 'api.auth.invalidCredentials');
    }

    // ✅ NEW CHECK — isBlocked & isDeleted
    if (user.isBlocked && !user.isDeleted) {
      return ApiResponse.badRequest(
        res,
        'api.auth.accountBlocked'
      );
    }

    if (user.isDeleted) {
      return ApiResponse.badRequest(
        res,
        'api.auth.accountDeleted'
      );
    }

    if (!user.hashedPassword) {
      return ApiResponse.badRequest(res, 'api.auth.passwordNotSet');
    }

    const isValid = await bcrypt.compare(password, user.hashedPassword);

    if (!isValid) {
      return ApiResponse.badRequest(res, 'api.auth.invalidCredentials');
    }



    await storage.updateUser(user.id, {
      lastPasswordLoginAt: new Date(),
    });

    req.session.userId = user.id;
    const token = generateToken(user);

    logger.info('User logged in with password', { userId: user.id, email: user.email });

    return ApiResponse.success(res, 'api.auth.loginSuccessful', {
      id: user.id,
      email: user.email,
      name: user.name,
      token,
      passwordSet: true,
    });
  } catch (error: any) {
    logger.error('Password login error', { error: error.message });
    return ApiResponse.serverError(res, error.message);
  }
});

router.post('/app/login-password', async (req, res) => {
  try {
    const {
      email,
      password,
      isFromGoogle = false,
      fcmToken,
      imagePath,
      deviceid,
      deviceType,
      deviceModel,
      appVersion,
      deviceManufacturer,
      deviceLocation,
    } = req.body;

    if (!email || !password) {
      return ApiResponse.badRequest(res, 'api.auth.emailAndPasswordRequired');
    }

    const user = await storage.getUserByEmail(email);
    if (!user || !user.hashedPassword) {
      return ApiResponse.badRequest(res, 'api.auth.invalidCredentials');
    }


    // ✅ NEW CHECK — isBlocked & isDeleted
    if (user.isBlocked && !user.isDeleted) {
      return ApiResponse.badRequest(
        res,
        'api.auth.accountBlocked'
      );
    }

    if (user.isDeleted) {
      return ApiResponse.badRequest(
        res,
        'api.auth.accountDeleted'
      );
    }

    const isValid = await bcrypt.compare(password, user.hashedPassword);
    if (!isValid) {
      return ApiResponse.badRequest(res, 'api.auth.invalidCredentials');
    }

    await storage.updateUser(user.id, {
      lastPasswordLoginAt: new Date(),
      ...(typeof isFromGoogle === 'boolean' && { isFromGoogle }),
      ...(fcmToken && { fcmToken }),
      ...(imagePath && { imagePath }),
      ...(deviceid && { deviceid }),
      ...(deviceType && { deviceType }),
      ...(deviceModel && { deviceModel }),
      ...(appVersion && { appVersion }),
      ...(deviceManufacturer && { deviceManufacturer }),
      ...(deviceLocation && { deviceLocation }),
    });

    const token = generateToken({ id: user.id, email: user.email });

    return ApiResponse.success(res, 'api.auth.loginSuccessful', {
      id: user.id,
      email: user.email,
      token,
      passwordSet: true,
    });
  } catch (err: any) {
    return ApiResponse.serverError(res, err.message);
  }
});

router.post('/set-password', requireAuth, async (req: any, res: Response) => {
  try {
    const { password, confirmPassword, name } = req.body;
    const userId = req.userId;

    console.log('password:', password, 'confirmPassword:', confirmPassword);
    // if (!password || !confirmPassword) {
    //   return ApiResponse.badRequest(res, "Password and confirmation are required");
    // }

    if (password !== confirmPassword) {
      return ApiResponse.badRequest(res, 'api.auth.passwordsDoNotMatch');
    }

    const validation = validatePassword(password);
    if (!validation.valid) {
      return ApiResponse.badRequest(res, validation.message || 'api.auth.invalidPassword');
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return ApiResponse.notFound(res, 'api.auth.userNotFound');
    }

    if (user.hashedPassword) {
      return ApiResponse.badRequest(res, 'api.auth.passwordAlreadySetForChange');
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await storage.updateUser(userId, {
      hashedPassword,
      passwordSetAt: new Date(),
      name
    });

    logger.info('Password set for user', { userId });

    return ApiResponse.success(res, 'api.auth.passwordSetSuccessfully');
  } catch (error: any) {
    logger.error('Set password error', { error: error.message });
    return ApiResponse.serverError(res, error.message);
  }
});

router.post('/app/set-password', async (req: any, res: Response) => {
  try {
    const { password, confirmPassword } = req.body;
    const { userId } = req.body;

    console.log('password:', password, 'confirmPassword:', confirmPassword);
    // if (!password || !confirmPassword) {
    //   return ApiResponse.badRequest(res, "Password and confirmation are required");
    // }

    if (password !== confirmPassword) {
      return ApiResponse.badRequest(res, 'api.auth.passwordsDoNotMatch');
    }

    const validation = validatePassword(password);
    if (!validation.valid) {
      return ApiResponse.badRequest(res, validation.message || 'api.auth.invalidPassword');
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return ApiResponse.notFound(res, 'api.auth.userNotFound');
    }

    if (user.hashedPassword) {
      return ApiResponse.badRequest(res, 'api.auth.passwordAlreadySetForChange');
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await storage.updateUser(userId, {
      hashedPassword,
      passwordSetAt: new Date(),
    });

    logger.info('Password set for user', { userId });

    return ApiResponse.success(res, 'api.auth.passwordSetSuccessfully');
  } catch (error: any) {
    logger.error('Set password error', { error: error.message });
    return ApiResponse.serverError(res, error.message);
  }
});

router.post('/change-password', requireAuth, async (req: any, res: Response) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.userId;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return ApiResponse.badRequest(res, 'api.auth.allFieldsRequired');
    }

    if (newPassword !== confirmPassword) {
      return ApiResponse.badRequest(res, 'api.auth.passwordsDoNotMatch');
    }

    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      return ApiResponse.badRequest(res, validation.message || 'api.auth.invalidPassword');
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return ApiResponse.notFound(res, 'api.auth.userNotFound');
    }

    if (!user.hashedPassword) {
      return ApiResponse.badRequest(res, 'api.auth.noPasswordSet');
    }

    const isValid = await bcrypt.compare(currentPassword, user.hashedPassword);
    if (!isValid) {
      return ApiResponse.badRequest(res, 'api.auth.currentPasswordIncorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await storage.updateUser(userId, {
      hashedPassword,
      passwordSetAt: new Date(),
    });

    logger.info('Password changed for user', { userId });

    return ApiResponse.success(res, 'api.auth.passwordChangedSuccessfully');
  } catch (error: any) {
    logger.error('Change password error', { error: error.message });
    return ApiResponse.serverError(res, error.message);
  }
});

router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return ApiResponse.badRequest(res, 'api.auth.emailRequired');
    }

    const user = await storage.getUserByEmail(email);

    // if (!user) {
    //   return ApiResponse.success(res, "If an account exists, a reset code has been sent", { email });
    // }

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await storage.createOTP({ email, code, expiresAt, verified: false, purpose: 'password_reset' });

    const emailContent = await generateOTPEmail(code);
    const platformName = (await storage.getSettingByKey('platform_name'))?.value || 'SkySIM';
    await sendEmail({
      to: email,
      subject: `Password Reset Code - ${platformName}`,
      html: emailContent.html.replace(/verification code/gi, 'password reset code'),
      text: (emailContent.text || '').replace(/verification code/gi, 'password reset code'),
    });

    logger.info('Password reset OTP sent', { email });

    return ApiResponse.success(res, 'api.auth.resetCodeSent', {
      email,
      code
    });
  } catch (error: any) {
    logger.error('Forgot password error', { error: error.message });
    return ApiResponse.serverError(res, error.message);
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;

    if (!email || !otp || !newPassword || !confirmPassword) {
      return ApiResponse.badRequest(res, 'api.auth.allFieldsRequired');
    }

    if (newPassword !== confirmPassword) {
      return ApiResponse.badRequest(res, 'api.auth.passwordsDoNotMatch');
    }

    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      return ApiResponse.badRequest(res, validation.message || 'api.auth.invalidPassword');
    }

    const isValid = await storage.verifyOTP(email, otp, 'password_reset');
    if (!isValid) {
      return ApiResponse.badRequest(res, 'api.auth.invalidResetCode');
    }

    const user = await storage.getUserByEmail(email);
    if (!user) {
      return ApiResponse.badRequest(res, 'api.auth.invalidResetCode');
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await storage.updateUser(user.id, {
      hashedPassword,
      passwordSetAt: new Date(),
    });

    logger.info('Password reset for user', { userId: user.id, email });

    return ApiResponse.success(
      res,
      'api.auth.passwordResetSuccessful',
    );
  } catch (error: any) {
    logger.error('Reset password error', { error: error.message });
    return ApiResponse.serverError(res, error.message);
  }
});

router.get('/admin/me', requireAdmin, async (req: Request, res: Response) => {
  try {
    console.log('Fetching user with ID:', req.session);
    const admin = await storage.getAdminById(req.session.adminId!);
    if (!admin) {
      return ApiResponse.notFound(res, 'api.auth.adminNotFound');
    }
    const { password, ...user } = admin;
    return ApiResponse.success(res, 'api.auth.adminFetchedSuccessfully', user);
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.get('/me', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;

    const user = await storage.getUserWithDestinationsAndCurrency(userId);
    if (!user) {
      return ApiResponse.notFound(res, 'api.auth.userNotFound');
    }

    const unreadNotificationCount = await storage.getUnreadNotificationCount(userId);

    return ApiResponse.success(res, 'api.auth.userFetchedSuccessfully', {
      ...user,
      unreadNotificationCount,
    });
  } catch (error: any) {
    return ApiResponse.serverError(res, error.message);
  }
});

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    return ApiResponse.success(res, 'api.auth.loggedOutSuccessfully');
  });
});

router.post('/app/login-with-google', async (req: Request, res: Response) => {
  try {
    const {
      email,
      fcmToken,
      imagePath,
      deviceid,
      deviceType,
      deviceModel,
      appVersion,
      deviceManufacturer,
      deviceLocation,
    } = req.body;

    if (!email) {
      return ApiResponse.badRequest(res, 'api.auth.emailRequired');
    }

    let user = await storage.getUserByEmail(email);

    /* -----------------------------------
       CREATE USER IF NOT EXISTS
    ----------------------------------- */
    if (!user) {
      user = await storage.createUser({
        email,
        kycStatus: 'pending',
        isFromGoogle: true,
        imagePath,
        fcmToken,
        deviceid,
        deviceType,
        deviceModel,
        appVersion,
        deviceManufacturer,
        deviceLocation,
      });
    } else {
      /* -----------------------------------
       CHECK BLOCKED/DELETED
    ----------------------------------- */
      if (user.isBlocked && !user.isDeleted) {
        return ApiResponse.badRequest(
          res,
          'api.auth.accountBlocked'
        );
      }

      if (user.isDeleted) {
        return ApiResponse.badRequest(
          res,
          'api.auth.accountDeleted'
        );
      }

      /* -----------------------------------
       UPDATE USER IF EXISTS
    ----------------------------------- */
      await storage.updateUser(user.id, {
        lastGoogleLoginAt: new Date(),
        isFromGoogle: true,
        ...(fcmToken && { fcmToken }),
        ...(imagePath && { imagePath }),
        ...(deviceid && { deviceid }),
        ...(deviceType && { deviceType }),
        ...(deviceModel && { deviceModel }),
        ...(appVersion && { appVersion }),
        ...(deviceManufacturer && { deviceManufacturer }),
        ...(deviceLocation && { deviceLocation }),
      });
    }

    /* -----------------------------------
       GENERATE TOKEN
    ----------------------------------- */
    const token = generateToken({
      id: user.id,
      email: user.email,
    });

    return ApiResponse.success(res, 'api.auth.loginSuccessful', {
      id: user.id,
      email: user.email,
      token,
      passwordSet: Boolean(user.hashedPassword),
    });
  } catch (err: any) {
    return ApiResponse.serverError(res, err.message);
  }
});





// google auth


router.post(
  "/web/login-with-google",
  async (req: Request, res: Response) => {
    try {
      const { idToken, referralCode } =
        req.body;


      console.log(idToken, referralCode, "Req body")

      /* -----------------------------------
         VALIDATE TOKEN
      ----------------------------------- */
      if (!idToken) {
        return ApiResponse.badRequest(
          res,
          "api.auth.firebaseTokenRequired"
        );
      }

      /* -----------------------------------
         VERIFY FIREBASE TOKEN
      ----------------------------------- */
      await initFirebaseAdmin();
      const decoded = await admin
        .auth()
        .verifyIdToken(idToken);

      const firebaseUid = decoded.uid;
      const email = decoded.email;
      const name = decoded.name;
      const imagePath = decoded.picture;

      if (!email) {
        return ApiResponse.badRequest(
          res,
          "api.auth.emailNotFound"
        );
      }

      /* -----------------------------------
         CHECK USER
      ----------------------------------- */
      let user =
        await storage.getUserByEmail(
          email
        );

      /* -----------------------------------
         CREATE USER (Signup via Google)
      ----------------------------------- */
      if (!user) {
        user =
          await storage.createUser({
            email,
            name,
            firebaseUid,
            isFromGoogle: true,
            imagePath,
            kycStatus: "pending",
          });

        /* -------- Referral Apply -------- */
        // if (referralCode) {
        //   try {
        //     await applyReferral(
        //       user.id,
        //       referralCode
        //     );
        //   } catch (err) {
        //     console.log(
        //       "Referral error:",
        //       err
        //     );
        //   }
        // }
      }
      /* -----------------------------------
         CHECK BLOCKED/DELETED
      ----------------------------------- */
      if (user && user.isBlocked && !user.isDeleted) {
        return ApiResponse.badRequest(
          res,
          "api.auth.accountBlocked"
        );
      }

      if (user && user.isDeleted) {
        return ApiResponse.badRequest(
          res,
          "api.auth.accountDeleted"
        );
      }

      /* -----------------------------------
         MERGE ACCOUNT
      ----------------------------------- */
      if (user && !user.firebaseUid) {
        await storage.updateUser(
          user.id,
          {
            firebaseUid,
            isFromGoogle: true,
          }
        );
      }

      /* -----------------------------------
         GENERATE SESSION / JWT
      ----------------------------------- */
      const token = generateToken({
        id: user.id,
        email: user.email,
      });

      req.session.userId = user.id;

      /* -----------------------------------
         RESPONSE
      ----------------------------------- */
      return ApiResponse.success(
        res,
        "api.auth.googleLoginSuccessful",
        {
          id: user.id,
          email: user.email,
          name: user.name,
          imagePath:
            user.imagePath,
          token,
          passwordSet: Boolean(
            user.hashedPassword
          ),
        }
      );
    } catch (err: any) {
      console.error(
        "Website Google login error:",
        err.message
      );

      return ApiResponse.serverError(
        res,
        err.message
      );
    }
  }
);




export default router;
