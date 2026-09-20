# Keep kotlinx.serialization generated serializers for all our API models
-keep,includedescriptorclasses class com.andx.supportchat.api.**$$serializer { *; }
-keepclassmembers class com.andx.supportchat.api.** {
    *** Companion;
}
-keepclasseswithmembers class com.andx.supportchat.api.** {
    kotlinx.serialization.KSerializer serializer(...);
}
