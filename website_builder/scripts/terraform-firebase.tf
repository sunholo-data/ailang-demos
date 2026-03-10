# ─────────────────────────────────────────────────────────────────────────────
# Terraform config for Website Builder Firebase + Firestore
# Copy this into your ailang-multivac Terraform project and apply.
#
# What it provisions:
#   1. Firebase project (enables Firebase on ailang-multivac-dev)
#   2. Firebase web app (outputs the config values for firebase.js)
#   3. Firestore database "website-builder" (dedicated, not default)
#   4. Firebase Auth (Google sign-in provider)
#   5. Firestore security rules
#   6. Service account permissions for Cloud Run
#
# After applying, run:
#   terraform output firebase_web_app_config
# to get the values needed for firebase.js
# ─────────────────────────────────────────────────────────────────────────────

variable "project_id" {
  default = "ailang-multivac-dev"
}

variable "region" {
  default = "europe-west1"
}

# ── APIs ──────────────────────────────────────────────────────────────────────

resource "google_project_service" "firebase" {
  project = var.project_id
  service = "firebase.googleapis.com"
}

resource "google_project_service" "firebase_auth" {
  project = var.project_id
  service = "identitytoolkit.googleapis.com"
}

resource "google_project_service" "firebase_hosting" {
  project = var.project_id
  service = "firebasehosting.googleapis.com"
}

# ── Firebase Project ──────────────────────────────────────────────────────────

resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.project_id

  depends_on = [google_project_service.firebase]
}

# ── Firebase Web App ──────────────────────────────────────────────────────────
# This creates the web app and generates the config (apiKey, appId, etc.)

resource "google_firebase_web_app" "website_builder" {
  provider     = google-beta
  project      = var.project_id
  display_name = "Website Builder Portal"

  depends_on = [google_firebase_project.default]
}

data "google_firebase_web_app_config" "website_builder" {
  provider   = google-beta
  project    = var.project_id
  web_app_id = google_firebase_web_app.website_builder.app_id
}

# ── Firestore Database (dedicated, not default) ──────────────────────────────

resource "google_firestore_database" "website_builder" {
  provider    = google-beta
  project     = var.project_id
  name        = "website-builder"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  # Prevent accidental deletion
  deletion_policy = "DELETE"  # Change to "ABANDON" in production
}

# ── Firestore Security Rules ─────────────────────────────────────────────────
# Users can read/write their own doc. messagesEnabled is read-only (admin-set).

resource "google_firebaserules_ruleset" "website_builder" {
  provider = google-beta
  project  = var.project_id

  source {
    files {
      name    = "firestore.rules"
      content = <<-EOT
        rules_version = '2';
        service cloud.firestore {
          match /databases/website-builder/documents {
            // Users can read/write their own settings
            match /users/{userId} {
              allow read: if request.auth != null && request.auth.uid == userId;
              allow write: if request.auth != null && request.auth.uid == userId
                // Prevent users from self-enabling admin fields
                && (!request.resource.data.diff(resource.data).affectedKeys()
                    .hasAny(['messagesEnabled', 'messagesEndpoint']));
            }

            // Site metadata and sharing
            match /sites/{siteId} {
              allow read: if request.auth != null && (
                resource.data.ownerUid == request.auth.uid ||
                request.auth.token.email in resource.data.sharedWith
              );
              allow create: if request.auth != null
                && request.resource.data.ownerUid == request.auth.uid;
              allow update: if request.auth != null && (
                resource.data.ownerUid == request.auth.uid ||
                request.auth.token.email in resource.data.sharedWith
              );

              // Comments subcollection
              match /comments/{commentId} {
                allow read: if request.auth != null;
                allow create: if request.auth != null
                  && request.resource.data.authorUid == request.auth.uid;
                allow update, delete: if request.auth != null
                  && resource.data.authorUid == request.auth.uid;
              }
            }
          }
        }
      EOT
    }
  }

  depends_on = [google_firestore_database.website_builder]
}

resource "google_firebaserules_release" "website_builder" {
  provider     = google-beta
  project      = var.project_id
  name         = "cloud.firestore/website-builder"
  ruleset_name = google_firebaserules_ruleset.website_builder.name

  depends_on = [google_firebaserules_ruleset.website_builder]
}

# ── Firebase Auth ─────────────────────────────────────────────────────────────
# Enable Google as a sign-in provider

resource "google_identity_platform_config" "default" {
  provider = google-beta
  project  = var.project_id

  sign_in {
    allow_duplicate_emails = false

    email {
      enabled           = false
      password_required = false
    }
  }

  depends_on = [google_project_service.firebase_auth]
}

resource "google_identity_platform_default_supported_idp_config" "google" {
  provider = google-beta
  project  = var.project_id
  idp_id   = "google.com"

  # These come from the OAuth 2.0 Client ID created by Firebase
  # If you already have an OAuth client, use those values.
  # Otherwise, Firebase auto-creates one when you enable Google sign-in.
  client_id     = "" # TODO: Set after Firebase project is created
  client_secret = "" # TODO: Set after Firebase project is created

  depends_on = [google_identity_platform_config.default]
}

# ── IAM: Cloud Run SA permissions ─────────────────────────────────────────────

# Allow the website builder SA to use Google APIs (Sheets, etc.)
resource "google_project_iam_member" "website_builder_service_usage" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:ailang-dev-website-builder@${var.project_id}.iam.gserviceaccount.com"
}

# Allow the SA to read/write Firestore (for server-side admin operations)
resource "google_project_iam_member" "website_builder_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:ailang-dev-website-builder@${var.project_id}.iam.gserviceaccount.com"
}

# ── Cloud Run env vars for coordinator messaging ──────────────────────────────
# Set these on the website-builder Cloud Run service so server.js can send/poll
# messages via the coordinator REST API instead of the ailang CLI.
#
# Example (add to your Cloud Run service Terraform resource):
#   env {
#     name  = "COORDINATOR_URL"
#     value = "https://${PREFIX}-coordinator-HASH.a.run.app"
#   }
#   env {
#     name  = "COORDINATOR_API_KEY"
#     value_source { secret_key_ref { secret = "coordinator-api-key", version = "latest" } }
#   }
#
# Without COORDINATOR_URL, server.js falls back to `ailang messages send` CLI.

# ── Outputs ───────────────────────────────────────────────────────────────────
# These values go into firebase.js

output "firebase_web_app_config" {
  description = "Firebase config for website_builder/portal/src/firebase.js"
  value = {
    apiKey            = data.google_firebase_web_app_config.website_builder.api_key
    authDomain        = "${var.project_id}.firebaseapp.com"
    projectId         = var.project_id
    storageBucket     = "${var.project_id}.appspot.com"
    messagingSenderId = data.google_firebase_web_app_config.website_builder.messaging_sender_id
    appId             = google_firebase_web_app.website_builder.app_id
    databaseId        = "website-builder"
  }
  sensitive = false
}

output "firestore_database_name" {
  value = google_firestore_database.website_builder.name
}

output "authorized_domains" {
  description = "Add these to Firebase Auth authorized domains"
  value = [
    "localhost",
    "ailang-multivac-dev.firebaseapp.com",
    "www.sunholo.com",
    "sunholo-voight-kampff.github.io",
    "ailang-dev-website-builder-ejjw6zt3bq-ew.a.run.app",
  ]
}
