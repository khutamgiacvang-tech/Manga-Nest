const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const DiscordStrategy = require("passport-discord").Strategy;

const User = require("../models/User");

/* =========================
   LOCAL LOGIN
========================= */

passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email });

        if (!user) {
          return done(null, false, {
            message: "Email không tồn tại.",
          });
        }

        const match = await user.comparePassword(password);

        if (!match) {
          return done(null, false, {
            message: "Sai mật khẩu.",
          });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    },
  ),
);

/* =========================
   GOOGLE LOGIN
========================= */

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,

      clientSecret: process.env.GOOGLE_CLIENT_SECRET,

      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },

    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleAvatar = profile.photos?.[0]?.value.replace(
          "=s96-c",
          "=s512",
        );

        let user = await User.findOne({
          googleId: profile.id,
        });

        if (!user) {
          user = await User.findOne({
            email: profile.emails[0].value,
          });

          if (user) {
            user.googleId = profile.id;

            if (googleAvatar) {
              user.avatar = googleAvatar;
            }

            await user.save();
          } else {
            user = await User.create({
              username: profile.displayName,

              email: profile.emails[0].value,

              avatar: googleAvatar,

              provider: "google",

              googleId: profile.id,

              role: "user",
            });
          }
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    },
  ),
);

/* =========================
   DISCORD LOGIN
========================= */

passport.use(
  new DiscordStrategy(
    {
      clientID: process.env.DISCORD_CLIENT_ID,

      clientSecret: process.env.DISCORD_CLIENT_SECRET,

      callbackURL: process.env.DISCORD_CALLBACK_URL,

      scope: ["identify", "email"],
    },

    async (accessToken, refreshToken, profile, done) => {
      try {
        let avatar = "/images/icon/avatar.png";

        if (profile.avatar) {
          const isGif = profile.avatar.startsWith("a_");

          avatar = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${isGif ? "gif" : "png"}?size=512`;
        }

        let user = await User.findOne({
          discordId: profile.id,
        });

        if (!user) {
          user = await User.findOne({
            email: profile.email,
          });

          if (user) {
            user.discordId = profile.id;

            user.avatar = avatar;

            await user.save();
          } else {
            user = await User.create({
              username: profile.username,

              email: profile.email,

              avatar,

              provider: "discord",

              discordId: profile.id,

              role: "user",
            });
          }
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    },
  ),
);

/* =========================
   SESSION
========================= */

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);

    done(null, user);
  } catch (err) {
    done(err);
  }
});

module.exports = passport;
