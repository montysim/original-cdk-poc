
from django.contrib import admin
from django.urls import include, path
from django.http import HttpResponse
import requests

def handleBasePath(request):
    # url = 'http://localhost:8001'
    url = 'http://internal-Djang-DDEPO-16JIPTBRE0Z1-1053028264.us-west-1.elb.amazonaws.com:80'
    req = requests.get(url)

    response = 'UP'
    if ('UP' in req.text):
        response = 'UP and CONNECTED'

    return HttpResponse('{ "status": "' + response + '" }')

# urls
urlpatterns = [
    path('', handleBasePath),
    path('api/v1/movies/', include('movies.urls')),
    path('api/v1/auth/', include('authentication.urls')),
    path('admin/', admin.site.urls),
]