
using Google.Cloud.Firestore;
using PawSense.Api.Services;
using FirebaseAdmin;
using FirebaseAdmin.Auth;
using Google.Apis.Auth.OAuth2;

var builder = WebApplication.CreateBuilder(args);

// ============================================
// FIREBASE ADMIN SDK
// ============================================

var firebaseApp = FirebaseApp.DefaultInstance
    ?? FirebaseApp.Create(new AppOptions
    {
        Credential = GoogleCredential.GetApplicationDefault(),
        ProjectId = "smart-pet-collar-24818"
    });

builder.Services.AddSingleton(
    FirebaseAuth.GetAuth(firebaseApp)
);

// ============================================
// API SERVICES
// ============================================

builder.Services.AddControllers();
builder.Services.AddOpenApi();

// ============================================
// FIRESTORE DATABASE
// ============================================

builder.Services.AddSingleton(_ =>
    FirestoreDb.Create("smart-pet-collar-24818")
);

// ============================================
// BACKGROUND SERVICES
// ============================================

builder.Services.AddHostedService<CollarOfflineMonitor>();

// ============================================
// BUILD APPLICATION
// ============================================

var app = builder.Build();

// ============================================
// HTTP REQUEST PIPELINE
// ============================================

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();
