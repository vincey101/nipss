<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Memo Notification</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      @media only screen and (max-width: 600px) {
        .content {
          width: 100% !important;
        }

        .button {
          width: 100% !important;
        }
      }
    </style>
  </head>
  <body
    style="margin:0; padding:0; font-family:Arial, sans-serif; background-color:#f4f4f4;"
  >
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table
            class="content"
            width="600"
            cellpadding="0"
            cellspacing="0"
            style="background-color:#ffffff; margin-top:20px; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.1);"
          >
            <tr style="background-color:#fff;">
              <td align="center" style="padding:20px;">
                <img
                  src="http://nipss.mysuperaiapp.com/assets/angular/browser/assets/images/nipss.png"
                  alt="Logo"
                  style="height:40px;"
                />
              </td>
            </tr>
            <tr>
              <td style="padding:30px;">
                <h2 style="margin-top:0; color:#333;">You've Got a New Memo Notification</h2>
                <p style="color:#555; font-size:16px;">
                  Document name <strong>{{$name}}</strong>,
                </p>
                <p style="color:#555; font-size:16px;">
                  This is to notify you of a recent update in your account or
                  activity that may require your attention.
                </p>

                <div style="margin:30px 0;">
                  <a
                    href="https://yourdomain.com/dashboard"
                    style="background-color:#004aad; color:#fff; text-decoration:none; padding:12px 20px; border-radius:5px; display:inline-block; font-weight:bold;"
                    class="button"
                  >
                    View Notification
                  </a>
                </div>

                {{-- <p style="color:#777; font-size:14px;">
                  If you have any questions or didn’t request this, please
                  contact our support team.
                </p> --}}
              </td>
            </tr>
            <tr style="background-color:#f0f0f0;">
              <td align="center" style="padding:20px; font-size:12px; color:#777;">
                &copy; Nipss | All rights reserved. <br />
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
