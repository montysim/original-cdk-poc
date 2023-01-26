
from django.contrib import admin
from django.urls import include, path
from django.http import HttpResponse

def handleBasePath(request):
    return HttpResponse('{ "status": "UP" }')

# urls
urlpatterns = [
    path('', handleBasePath),
    path('api/v1/movies/', include('movies.urls')),
    path('api/v1/auth/', include('authentication.urls')),
    path('admin/', admin.site.urls),
]